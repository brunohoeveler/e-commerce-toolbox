import type { OAuthProvider } from "@shared/schema";
import crypto from "crypto";

export interface OAuthProviderConfig {
  provider: OAuthProvider;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  buildAuthUrl: (config: OAuthStartParams) => string;
  exchangeCode: (code: string, redirectUri: string) => Promise<OAuthTokenResult>;
  refreshAccessToken: (refreshToken: string) => Promise<OAuthTokenResult>;
  fetchTransactions: (accessToken: string, params: ApiFetchParams) => Promise<ApiTransactionResult>;
  getClientId: () => string;
  getClientSecret: () => string;
}

export interface OAuthStartParams {
  redirectUri: string;
  state: string;
  shopDomain?: string;
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  providerAccountId?: string;
  merchantId?: string;
  metadata?: Record<string, any>;
}

export interface ApiFetchParams {
  startDate: string;
  endDate: string;
  dataType: string;
  merchantId?: string;
  shopDomain?: string;
  providerAccountId?: string;
}

export interface ApiTransactionResult {
  data: Record<string, any>[];
  columns: string[];
  totalCount: number;
  currency?: string;
  hasMore?: boolean;
}

export interface OAuthState {
  mandantId: string;
  userId: string;
  provider: OAuthProvider;
  nonce: string;
  shopDomain?: string;
  createdAt: number;
}

const pendingOAuthStates = new Map<string, OAuthState>();

export function createOAuthState(data: Omit<OAuthState, "nonce" | "createdAt">): string {
  const nonce = crypto.randomBytes(32).toString("hex");
  const state: OAuthState = { ...data, nonce, createdAt: Date.now() };
  const stateKey = crypto.createHash("sha256").update(nonce).digest("hex");
  pendingOAuthStates.set(stateKey, state);
  setTimeout(() => pendingOAuthStates.delete(stateKey), 10 * 60 * 1000);
  return stateKey;
}

export function consumeOAuthState(stateKey: string): OAuthState | null {
  const state = pendingOAuthStates.get(stateKey);
  if (!state) return null;
  if (Date.now() - state.createdAt > 10 * 60 * 1000) {
    pendingOAuthStates.delete(stateKey);
    return null;
  }
  pendingOAuthStates.delete(stateKey);
  return state;
}

function env(key: string): string {
  return process.env[key] || "";
}

async function httpPost(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
  const isFormEncoded = headers["Content-Type"] === "application/x-www-form-urlencoded";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      ...headers,
    },
    body: isFormEncoded
      ? new URLSearchParams(body).toString()
      : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token request failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function httpGet(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json", ...headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API request failed (${res.status}): ${text}`);
  }
  return res.json();
}

const stripeProvider: OAuthProviderConfig = {
  provider: "stripe",
  authorizationUrl: "https://connect.stripe.com/oauth/authorize",
  tokenUrl: "https://connect.stripe.com/oauth/token",
  scopes: ["read_write"],
  getClientId: () => env("STRIPE_CLIENT_ID"),
  getClientSecret: () => env("STRIPE_SECRET_KEY"),

  buildAuthUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.getClientId(),
      scope: this.scopes.join(" "),
      redirect_uri: redirectUri,
      state,
    });
    return `${this.authorizationUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const data = await httpPost(this.tokenUrl, {
      grant_type: "authorization_code",
      code,
      client_secret: stripeProvider.getClientSecret(),
    }, { "Content-Type": "application/x-www-form-urlencoded" });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      providerAccountId: data.stripe_user_id,
    };
  },

  async refreshAccessToken(refreshToken) {
    const data = await httpPost(this.tokenUrl, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_secret: stripeProvider.getClientSecret(),
    }, { "Content-Type": "application/x-www-form-urlencoded" });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
    };
  },

  async fetchTransactions(accessToken, params) {
    const startTimestamp = Math.floor(new Date(params.startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(params.endDate).getTime() / 1000);

    let allCharges: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const queryParams = new URLSearchParams({
        "created[gte]": String(startTimestamp),
        "created[lte]": String(endTimestamp),
        limit: "100",
      });
      if (startingAfter) queryParams.set("starting_after", startingAfter);

      const url = params.dataType === "payments"
        ? `https://api.stripe.com/v1/payment_intents?${queryParams}`
        : `https://api.stripe.com/v1/charges?${queryParams}`;

      const result = await httpGet(url, {
        "Authorization": `Bearer ${accessToken}`,
      });

      const items = result.data || [];
      allCharges.push(...items);
      hasMore = result.has_more || false;
      if (items.length > 0) startingAfter = items[items.length - 1].id;
    }

    const rows = allCharges.map((ch: any) => ({
      id: ch.id,
      amount: (ch.amount || 0) / 100,
      currency: (ch.currency || "eur").toUpperCase(),
      status: ch.status,
      created: new Date((ch.created || 0) * 1000).toISOString().split("T")[0],
      description: ch.description || "",
      customer: ch.customer || "",
      payment_method: ch.payment_method_types?.[0] || ch.payment_method || "",
      fee: ch.application_fee_amount ? ch.application_fee_amount / 100 : 0,
      net: (ch.amount || 0) / 100 - (ch.application_fee_amount ? ch.application_fee_amount / 100 : 0),
      country: ch.billing_details?.address?.country || ch.metadata?.country || "",
    }));

    const columns = rows.length > 0 ? Object.keys(rows[0]) : ["id", "amount", "currency", "status", "created", "description", "customer", "payment_method", "fee", "net", "country"];
    return { data: rows, columns, totalCount: rows.length };
  },
};

const paypalProvider: OAuthProviderConfig = {
  provider: "paypal",
  authorizationUrl: "https://www.paypal.com/signin/authorize",
  tokenUrl: "https://api-m.paypal.com/v1/oauth2/token",
  scopes: ["openid", "https://uri.paypal.com/services/reporting/search/read"],
  getClientId: () => env("PAYPAL_CLIENT_ID"),
  getClientSecret: () => env("PAYPAL_CLIENT_SECRET"),

  buildAuthUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
      flowEntry: "static",
      client_id: this.getClientId(),
      response_type: "code",
      scope: this.scopes.join(" "),
      redirect_uri: redirectUri,
      state,
    });
    return `${this.authorizationUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const auth = Buffer.from(`${paypalProvider.getClientId()}:${paypalProvider.getClientSecret()}`).toString("base64");
    const data = await httpPost(paypalProvider.tokenUrl, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${auth}`,
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    };
  },

  async refreshAccessToken(refreshToken) {
    const auth = Buffer.from(`${paypalProvider.getClientId()}:${paypalProvider.getClientSecret()}`).toString("base64");
    const data = await httpPost(paypalProvider.tokenUrl, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${auth}`,
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  },

  async fetchTransactions(accessToken, params) {
    const allTransactions: any[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const queryParams = new URLSearchParams({
        start_date: `${params.startDate}T00:00:00-0000`,
        end_date: `${params.endDate}T23:59:59-0000`,
        fields: "all",
        page_size: "100",
        page: String(page),
      });
      const url = `https://api-m.paypal.com/v1/reporting/transactions?${queryParams}`;
      const result = await httpGet(url, {
        "Authorization": `Bearer ${accessToken}`,
      });

      const items = result.transaction_details || [];
      allTransactions.push(...items);
      totalPages = result.total_pages || 1;
      page++;
    }

    const rows = allTransactions.map((t: any) => {
      const info = t.transaction_info || {};
      const payer = t.payer_info || {};
      return {
        id: info.transaction_id || "",
        amount: parseFloat(info.transaction_amount?.value || "0"),
        currency: (info.transaction_amount?.currency_code || "EUR").toUpperCase(),
        fee: parseFloat(info.fee_amount?.value || "0"),
        net: parseFloat(info.transaction_amount?.value || "0") + parseFloat(info.fee_amount?.value || "0"),
        status: info.transaction_status || "",
        created: (info.transaction_initiation_date || "").split("T")[0],
        description: info.transaction_subject || info.transaction_note || "",
        payer_email: payer.email_address || "",
        payer_name: `${payer.payer_name?.given_name || ""} ${payer.payer_name?.surname || ""}`.trim(),
        country: payer.country_code || "",
        payment_method: info.payment_method_type || "",
      };
    });

    const columns = rows.length > 0 ? Object.keys(rows[0]) : ["id", "amount", "currency", "fee", "net", "status", "created", "description", "payer_email", "payer_name", "country", "payment_method"];
    return { data: rows, columns, totalCount: rows.length };
  },
};

const amazonProvider: OAuthProviderConfig = {
  provider: "amazon",
  authorizationUrl: "https://sellercentral.amazon.de/apps/authorize/consent",
  tokenUrl: "https://api.amazon.com/auth/o2/token",
  scopes: [],
  getClientId: () => env("AMAZON_SP_APP_ID"),
  getClientSecret: () => env("AMAZON_SP_CLIENT_SECRET"),

  buildAuthUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
      application_id: this.getClientId(),
      redirect_uri: redirectUri,
      state,
    });
    return `${this.authorizationUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const data = await httpPost(amazonProvider.tokenUrl, {
      grant_type: "authorization_code",
      code,
      client_id: amazonProvider.getClientId(),
      client_secret: amazonProvider.getClientSecret(),
      redirect_uri: redirectUri,
    }, { "Content-Type": "application/x-www-form-urlencoded" });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  },

  async refreshAccessToken(refreshToken) {
    const data = await httpPost(amazonProvider.tokenUrl, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: amazonProvider.getClientId(),
      client_secret: amazonProvider.getClientSecret(),
    }, { "Content-Type": "application/x-www-form-urlencoded" });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  },

  async fetchTransactions(accessToken, params) {
    const queryParams = new URLSearchParams({
      MarketplaceIds: "A1PA6795UKMFR9",
      CreatedAfter: params.startDate,
      CreatedBefore: params.endDate,
      MaxResultsPerPage: "100",
    });
    const url = `https://sellingpartnerapi-eu.amazon.com/orders/v0/orders?${queryParams}`;
    const result = await httpGet(url, {
      "Authorization": `Bearer ${accessToken}`,
      "x-amz-access-token": accessToken,
    });

    const orders = result.payload?.Orders || [];
    const rows = orders.map((o: any) => ({
      id: o.AmazonOrderId || "",
      amount: parseFloat(o.OrderTotal?.Amount || "0"),
      currency: (o.OrderTotal?.CurrencyCode || "EUR").toUpperCase(),
      status: o.OrderStatus || "",
      created: (o.PurchaseDate || "").split("T")[0],
      fulfillment: o.FulfillmentChannel || "",
      marketplace: o.MarketplaceId || "",
      country: o.ShippingAddress?.CountryCode || "",
      items: o.NumberOfItemsShipped || 0,
    }));

    const columns = rows.length > 0 ? Object.keys(rows[0]) : ["id", "amount", "currency", "status", "created", "fulfillment", "marketplace", "country", "items"];
    return { data: rows, columns, totalCount: rows.length };
  },
};

const shopifyProvider: OAuthProviderConfig = {
  provider: "shopify",
  authorizationUrl: "",
  tokenUrl: "",
  scopes: ["read_orders", "read_transactions", "read_reports"],
  getClientId: () => env("SHOPIFY_CLIENT_ID"),
  getClientSecret: () => env("SHOPIFY_CLIENT_SECRET"),

  buildAuthUrl({ redirectUri, state, shopDomain }) {
    if (!shopDomain) throw new Error("Shopify erfordert eine Shop-Domain");
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      scope: this.scopes.join(","),
      redirect_uri: redirectUri,
      state,
    });
    return `https://${shopDomain}/admin/oauth/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const shopDomain = redirectUri.split("shopDomain=")[1] || "";
    const url = `https://${shopDomain}/admin/oauth/access_token`;
    const data = await httpPost(url, {
      client_id: shopifyProvider.getClientId(),
      client_secret: shopifyProvider.getClientSecret(),
      code,
    }, { "Content-Type": "application/json" });
    return {
      accessToken: data.access_token,
      scope: data.scope,
      metadata: { shopDomain },
    };
  },

  async refreshAccessToken(_refreshToken) {
    return { accessToken: _refreshToken };
  },

  async fetchTransactions(accessToken, params) {
    const shopDomain = params.shopDomain;
    if (!shopDomain) throw new Error("Shop domain required");

    const queryParams = new URLSearchParams({
      created_at_min: `${params.startDate}T00:00:00Z`,
      created_at_max: `${params.endDate}T23:59:59Z`,
      status: "any",
      limit: "250",
    });
    const url = `https://${shopDomain}/admin/api/2024-01/orders.json?${queryParams}`;
    const result = await httpGet(url, {
      "X-Shopify-Access-Token": accessToken,
    });

    const orders = result.orders || [];
    const rows = orders.map((o: any) => ({
      id: String(o.id),
      order_number: o.order_number || "",
      amount: parseFloat(o.total_price || "0"),
      currency: (o.currency || "EUR").toUpperCase(),
      status: o.financial_status || "",
      created: (o.created_at || "").split("T")[0],
      customer_email: o.email || "",
      customer_name: `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim(),
      country: o.billing_address?.country_code || o.shipping_address?.country_code || "",
      payment_gateway: (o.payment_gateway_names || []).join(", "),
      items_count: (o.line_items || []).length,
      tax: parseFloat(o.total_tax || "0"),
      discount: parseFloat(o.total_discounts || "0"),
    }));

    const columns = rows.length > 0 ? Object.keys(rows[0]) : ["id", "order_number", "amount", "currency", "status", "created", "customer_email", "customer_name", "country", "payment_gateway", "items_count", "tax", "discount"];
    return { data: rows, columns, totalCount: rows.length };
  },
};

const providerRegistry: Record<OAuthProvider, OAuthProviderConfig> = {
  stripe: stripeProvider,
  paypal: paypalProvider,
  amazon: amazonProvider,
  shopify: shopifyProvider,
};

export function getProvider(provider: OAuthProvider): OAuthProviderConfig | undefined {
  return providerRegistry[provider];
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  const p = providerRegistry[provider];
  if (!p) return false;
  return !!p.getClientId() && !!p.getClientSecret();
}

export function getConfiguredProviders(): OAuthProvider[] {
  return (Object.keys(providerRegistry) as OAuthProvider[]).filter(isProviderConfigured);
}

export async function refreshTokenIfNeeded(
  connection: { accessToken?: string; refreshToken?: string; tokenExpiresAt?: string; platform: OAuthProvider }
): Promise<OAuthTokenResult | null> {
  if (!connection.tokenExpiresAt || !connection.refreshToken) return null;
  const expiresAt = new Date(connection.tokenExpiresAt).getTime();
  const now = Date.now();
  if (expiresAt - now > 5 * 60 * 1000) return null;

  const provider = getProvider(connection.platform);
  if (!provider) return null;

  return provider.refreshAccessToken(connection.refreshToken);
}
