import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Users, UserPlus, Trash2, Save, LayoutDashboard, Info, Plug, Plus, CheckCircle2, XCircle, ExternalLink, Loader2, Unplug, Store } from "lucide-react";
import { SiStripe, SiPaypal, SiAmazon, SiShopify } from "react-icons/si";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Mandant, DashboardConfig, ApiConnection, OAuthProvider } from "@shared/schema";
import { defaultDashboardConfig, normalizeDashboardConfig, OAUTH_PROVIDERS } from "@shared/schema";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface MandantSettingsPageProps {
  mandantId: string | null;
  mandant: Mandant | null;
}

interface AssignedUser {
  id: string;
  user: AuthUser;
}

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  stripe: SiStripe,
  paypal: SiPaypal,
  amazon: SiAmazon,
  shopify: SiShopify,
};

function SectionHeader({ icon: Icon, title, description, action }: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-2">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function MandantSettingsPage({ mandantId, mandant }: MandantSettingsPageProps) {
  const { toast } = useToast();
  const { isInternal } = useAuth();
  const [showAddUser, setShowAddUser] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    mandantenNummer: 0,
    beraterNummer: 0,
    sachkontenLaenge: 4,
    sachkontenRahmen: 3,
  });

  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig>(defaultDashboardConfig);
  const [ossBeteiligung, setOssBeteiligung] = useState(false);
  const [apiConnections, setApiConnections] = useState<ApiConnection[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<OAuthProvider | null>(null);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [showShopifyDialog, setShowShopifyDialog] = useState(false);

  useEffect(() => {
    if (mandant) {
      setFormData({
        name: mandant.name,
        mandantenNummer: mandant.mandantenNummer,
        beraterNummer: mandant.beraterNummer,
        sachkontenLaenge: mandant.sachkontenLaenge,
        sachkontenRahmen: mandant.sachkontenRahmen,
      });
      setDashboardConfig(normalizeDashboardConfig(mandant.dashboardConfig));
      setOssBeteiligung(!!(mandant as any).ossBeteiligung);
      setApiConnections(((mandant as any).apiConnections as ApiConnection[]) || []);
    }
  }, [mandant]);

  const { data: assignedUsers, isLoading: usersLoading } = useQuery<AssignedUser[]>({
    queryKey: ["/api/mandanten", mandantId, "users"],
    queryFn: async () => {
      const res = await fetch(`/api/mandanten/${mandantId}/users`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/mandanten/${mandantId}`, {
        ...formData,
        dashboardConfig,
        ossBeteiligung,
        apiConnections,
      });
    },
    onSuccess: () => {
      toast({
        title: "Gespeichert",
        description: "Alle Mandanteninformationen wurden aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Änderungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const assignUserMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/mandanten/${mandantId}/users`, {
        email: userEmail,
      });
    },
    onSuccess: () => {
      toast({
        title: "Benutzer zugewiesen",
        description: "Der Benutzer hat nun Zugriff auf dieses Mandat.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten", mandantId, "users"] });
      setShowAddUser(false);
      setUserEmail("");
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Benutzer konnte nicht zugewiesen werden.",
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/mandanten/${mandantId}/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Zugriff entfernt",
        description: "Der Benutzer hat keinen Zugriff mehr auf dieses Mandat.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten", mandantId, "users"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Zugriff konnte nicht entfernt werden.",
        variant: "destructive",
      });
    },
  });

  const { data: oauthProviders } = useQuery<Array<{ value: string; label: string; description: string; configured: boolean }>>({
    queryKey: ["/api/oauth/providers"],
  });

  const { data: oauthStatus, refetch: refetchOAuthStatus } = useQuery<Array<{ id: string; platform: string; label: string; connected: boolean; connectedAt?: string; providerAccountId?: string; shopDomain?: string }>>({
    queryKey: ["/api/mandanten", mandantId, "oauth", "status"],
    queryFn: async () => {
      const res = await fetch(`/api/mandanten/${mandantId}/oauth/status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!mandantId,
    refetchInterval: 5000,
  });

  const handleOAuthConnect = async (provider: OAuthProvider) => {
    if (provider === "shopify") {
      setShowShopifyDialog(true);
      return;
    }
    setConnectingProvider(provider);
    try {
      const res = await fetch(`/api/mandanten/${mandantId}/oauth/${provider}/start`, { credentials: "include" });
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
      } else {
        toast({ title: "Fehler", description: data.message || "OAuth-Flow konnte nicht gestartet werden", variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Verbindung konnte nicht hergestellt werden", variant: "destructive" });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleShopifyConnect = async () => {
    if (!shopifyDomain) return;
    setConnectingProvider("shopify");
    setShowShopifyDialog(false);
    try {
      const domain = shopifyDomain.includes(".myshopify.com") ? shopifyDomain : `${shopifyDomain}.myshopify.com`;
      const res = await fetch(`/api/mandanten/${mandantId}/oauth/shopify/start?shopDomain=${encodeURIComponent(domain)}`, { credentials: "include" });
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
      } else {
        toast({ title: "Fehler", description: data.message || "OAuth-Flow konnte nicht gestartet werden", variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Verbindung konnte nicht hergestellt werden", variant: "destructive" });
    } finally {
      setConnectingProvider(null);
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      return apiRequest("POST", `/api/mandanten/${mandantId}/oauth/${provider}/disconnect`);
    },
    onSuccess: () => {
      toast({ title: "Getrennt", description: "Die Verbindung wurde erfolgreich entfernt." });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
      refetchOAuthStatus();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Verbindung konnte nicht getrennt werden", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") === "true") {
      const provider = params.get("provider");
      toast({ title: "Verbunden", description: `${provider} wurde erfolgreich verbunden.` });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
      refetchOAuthStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("oauth_error")) {
      const error = params.get("oauth_error");
      toast({ title: "Fehler", description: `OAuth-Fehler: ${error}`, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (!mandantId || !mandant) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Kein Mandat ausgewählt</h3>
            <p className="text-muted-foreground">
              Bitte wählen Sie ein Mandat aus der Seitenleiste.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-8 pb-24">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Mandanteninformationen</h1>
          <p className="text-muted-foreground">
            Einstellungen und Konfiguration für {mandant.name}
          </p>
        </div>

        {/* Stammdaten */}
        <section className="space-y-4" data-testid="section-stammdaten">
          <SectionHeader
            icon={Building2}
            title="Stammdaten"
            description="Grundlegende Informationen zum Mandat"
          />
          <div className="space-y-4 pl-11">
            <div className="space-y-2">
              <Label htmlFor="name">Mandantenname</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={!isInternal}
                data-testid="input-mandant-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mandantenNummer">Mandantennummer</Label>
                <Input
                  id="mandantenNummer"
                  type="number"
                  value={formData.mandantenNummer}
                  onChange={(e) => setFormData(prev => ({ ...prev, mandantenNummer: parseInt(e.target.value) || 0 }))}
                  disabled={!isInternal}
                  data-testid="input-mandanten-nummer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beraterNummer">Beraternummer</Label>
                <Input
                  id="beraterNummer"
                  type="number"
                  value={formData.beraterNummer}
                  onChange={(e) => setFormData(prev => ({ ...prev, beraterNummer: parseInt(e.target.value) || 0 }))}
                  disabled={!isInternal}
                  data-testid="input-berater-nummer"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sachkontenLaenge">Sachkontenlänge</Label>
                <Input
                  id="sachkontenLaenge"
                  type="number"
                  value={formData.sachkontenLaenge}
                  onChange={(e) => setFormData(prev => ({ ...prev, sachkontenLaenge: parseInt(e.target.value) || 4 }))}
                  disabled={!isInternal}
                  data-testid="input-sachkonten-laenge"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sachkontenRahmen">Sachkontenrahmen</Label>
                <Input
                  id="sachkontenRahmen"
                  type="number"
                  value={formData.sachkontenRahmen}
                  onChange={(e) => setFormData(prev => ({ ...prev, sachkontenRahmen: parseInt(e.target.value) || 3 }))}
                  disabled={!isInternal}
                  data-testid="input-sachkonten-rahmen"
                />
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Sonstige Informationen */}
        <section className="space-y-4" data-testid="section-sonstige">
          <SectionHeader
            icon={Info}
            title="Sonstige Informationen"
            description="Zusätzliche Einstellungen und Informationen"
          />
          <div className="space-y-4 pl-11">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="ossBeteiligung">OSS Beteiligung</Label>
                <p className="text-sm text-muted-foreground">
                  Nimmt der Mandant am One-Stop-Shop-Verfahren teil?
                </p>
              </div>
              <Switch
                id="ossBeteiligung"
                checked={ossBeteiligung}
                onCheckedChange={setOssBeteiligung}
                disabled={!isInternal}
                data-testid="switch-oss-beteiligung"
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* Dashboardverwaltung */}
        <section className="space-y-4" data-testid="section-dashboard">
          <SectionHeader
            icon={LayoutDashboard}
            title="Dashboardverwaltung"
            description="Konfigurieren Sie, welche Elemente im Dashboard angezeigt werden"
          />
          <div className="pl-11">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: "showRevenue", key: "showRevenue" as const, label: "Umsatz (aus Umsatz-Prozessen)" },
                { id: "showPayments", key: "showPayments" as const, label: "Zahlungen (aus Zahlungs-Prozessen)" },
                { id: "showOpenPayments", key: "showOpenPayments" as const, label: "Offene Zahlungen (Umsätze - Zahlungen)" },
                { id: "showTransactions", key: "showTransactions" as const, label: "Buchungen (Transaktionsanzahl)" },
                { id: "showTotalRevenue", key: "showTotalRevenue" as const, label: "Gesamtumsatz" },
                { id: "showRevenueByPlatform", key: "showRevenueByPlatform" as const, label: "Umsatz nach Plattform" },
                { id: "showRevenueByCountry", key: "showRevenueByCountry" as const, label: "Umsatz nach Ländern" },
                { id: "showRevenueByCurrency", key: "showRevenueByCurrency" as const, label: "Umsatz nach Währungen" },
                { id: "showVouchers", key: "showVouchers" as const, label: "Gutscheine (aus Gutschein-Prozessen)" },
                { id: "showProcessExecutions", key: "showProcessExecutions" as const, label: "Ausgeführte Prozesse" },
                { id: "showProcessTodos", key: "showProcessTodos" as const, label: "Prozess-Aufgaben (To-Do-Liste)" },
              ].map(item => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={item.id}
                    checked={dashboardConfig[item.key]}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, [item.key]: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid={`checkbox-${item.id}`}
                  />
                  <Label htmlFor={item.id} className="font-normal cursor-pointer text-sm">
                    {item.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* APIs / Schnittstellen (OAuth 2.0) */}
        <section className="space-y-4" data-testid="section-apis">
          <SectionHeader
            icon={Plug}
            title="API-Schnittstellen"
            description="Verbinden Sie Zahlungsplattformen per OAuth 2.0, um Transaktionsdaten live abzurufen"
          />
          <div className="pl-11 space-y-3">
            {OAUTH_PROVIDERS.map((provider) => {
              const ProviderIcon = PROVIDER_ICONS[provider.value] || Plug;
              const connectedInfo = oauthStatus?.find(s => s.platform === provider.value);
              const providerConfig = oauthProviders?.find(p => p.value === provider.value);
              const isConfigured = providerConfig?.configured ?? false;
              const isConnected = !!connectedInfo?.connected;
              const isConnecting = connectingProvider === provider.value;

              return (
                <div
                  key={provider.value}
                  className="flex items-center justify-between gap-3 p-4 rounded-lg border"
                  data-testid={`oauth-provider-${provider.value}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-md bg-muted p-2.5 shrink-0">
                      <ProviderIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{provider.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
                      {isConnected && connectedInfo?.connectedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Verbunden seit {new Date(connectedInfo.connectedAt).toLocaleDateString("de-DE")}
                          {connectedInfo.providerAccountId && (
                            <span className="ml-1">({connectedInfo.providerAccountId})</span>
                          )}
                          {connectedInfo.shopDomain && (
                            <span className="ml-1">({connectedInfo.shopDomain})</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isConnected ? (
                      <>
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm hidden sm:inline">Verbunden</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => disconnectMutation.mutate(provider.value)}
                          disabled={disconnectMutation.isPending}
                          data-testid={`button-disconnect-${provider.value}`}
                        >
                          <Unplug className="h-4 w-4 mr-1" />
                          Trennen
                        </Button>
                      </>
                    ) : (
                      <>
                        {!isConfigured && (
                          <Badge variant="secondary" className="text-xs">
                            Nicht konfiguriert
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleOAuthConnect(provider.value)}
                          disabled={isConnecting || !isConfigured}
                          data-testid={`button-connect-${provider.value}`}
                        >
                          {isConnecting ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <ExternalLink className="h-4 w-4 mr-1" />
                          )}
                          Verbinden
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                Klicken Sie auf "Verbinden", um sich per OAuth 2.0 mit der jeweiligen Plattform zu autorisieren.
                Der Mandant wird zur Plattform weitergeleitet und erteilt dort den Zugriff.
              </span>
            </div>
          </div>
        </section>

        {/* Shopify Domain Dialog */}
        <Dialog open={showShopifyDialog} onOpenChange={setShowShopifyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Shopify-Shop verbinden</DialogTitle>
              <DialogDescription>
                Geben Sie die Shop-Domain ein, um die OAuth-Verbindung herzustellen
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="shopifyDomain">Shop-Domain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="shopifyDomain"
                    placeholder="mein-shop"
                    value={shopifyDomain}
                    onChange={(e) => setShopifyDomain(e.target.value)}
                    data-testid="input-shopify-domain"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.myshopify.com</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowShopifyDialog(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={handleShopifyConnect}
                disabled={!shopifyDomain}
                data-testid="button-confirm-shopify"
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Verbinden
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isInternal && (
          <>
            <Separator />

            {/* Benutzerberechtigungen */}
            <section className="space-y-4" data-testid="section-benutzer">
              <SectionHeader
                icon={Users}
                title="Benutzerberechtigungen"
                description="Verwalten Sie den Zugriff auf dieses Mandat"
                action={
                  <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-user">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Hinzufügen
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Benutzer hinzufügen</DialogTitle>
                        <DialogDescription>
                          Geben Sie die E-Mail-Adresse des Benutzers ein
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="userEmail">E-Mail-Adresse</Label>
                          <Input
                            id="userEmail"
                            type="email"
                            placeholder="benutzer@example.com"
                            value={userEmail}
                            onChange={(e) => setUserEmail(e.target.value)}
                            data-testid="input-user-email"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddUser(false)}>
                          Abbrechen
                        </Button>
                        <Button
                          onClick={() => assignUserMutation.mutate()}
                          disabled={!userEmail || assignUserMutation.isPending}
                          data-testid="button-confirm-add-user"
                        >
                          Hinzufügen
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                }
              />
              <div className="pl-11">
                {usersLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : assignedUsers && assignedUsers.length > 0 ? (
                  <div className="space-y-2">
                    {assignedUsers.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-md border"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={assignment.user.image || undefined} />
                            <AvatarFallback>
                              {assignment.user.name?.[0] || assignment.user.email?.[0] || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{assignment.user.name}</p>
                            <p className="text-xs text-muted-foreground">{assignment.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Extern</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUserMutation.mutate(assignment.user.id)}
                            disabled={removeUserMutation.isPending}
                            data-testid={`button-remove-user-${assignment.user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground rounded-md border border-dashed">
                    <Users className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Keine externen Benutzer</p>
                    <p className="text-xs mt-1">Fügen Sie Benutzer hinzu, um ihnen Zugriff zu gewähren</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* Sticky Save Button */}
        {isInternal && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-end gap-3">
              <p className="text-sm text-muted-foreground mr-auto hidden sm:block">
                Änderungen werden erst nach dem Speichern übernommen
              </p>
              <Button
                onClick={() => saveAllMutation.mutate()}
                disabled={saveAllMutation.isPending}
                data-testid="button-save-all"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveAllMutation.isPending ? "Wird gespeichert..." : "Alle Änderungen speichern"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
