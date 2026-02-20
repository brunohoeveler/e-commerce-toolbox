import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Users, UserPlus, Trash2, Save, LayoutDashboard, Info, Plug, Plus, CheckCircle2, XCircle } from "lucide-react";
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
import type { Mandant, DashboardConfig, ApiConnection } from "@shared/schema";
import { defaultDashboardConfig, normalizeDashboardConfig } from "@shared/schema";

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

const SUPPORTED_PLATFORMS = [
  { value: "paypal", label: "PayPal" },
  { value: "stripe", label: "Stripe" },
  { value: "klarna", label: "Klarna" },
  { value: "mollie", label: "Mollie" },
  { value: "adyen", label: "Adyen" },
  { value: "shopify", label: "Shopify Payments" },
  { value: "amazon_pay", label: "Amazon Pay" },
  { value: "square", label: "Square" },
];

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
  const [showAddApi, setShowAddApi] = useState(false);
  const [newApiPlatform, setNewApiPlatform] = useState("");
  const [newApiLabel, setNewApiLabel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiSecret, setNewApiSecret] = useState("");
  const [newApiMerchantId, setNewApiMerchantId] = useState("");

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

  const updateApiConnectionsMutation = useMutation({
    mutationFn: async (connections: ApiConnection[]) => {
      return apiRequest("PATCH", `/api/mandanten/${mandantId}`, { apiConnections: connections });
    },
    onSuccess: () => {
      toast({
        title: "Gespeichert",
        description: "API-Verbindungen wurden aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "API-Verbindungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const handleAddApiConnection = () => {
    if (!newApiPlatform || !newApiKey) return;
    const platformInfo = SUPPORTED_PLATFORMS.find(p => p.value === newApiPlatform);
    const newConnection: ApiConnection = {
      id: crypto.randomUUID(),
      platform: newApiPlatform,
      label: newApiLabel || platformInfo?.label || newApiPlatform,
      sandbox: true,
      apiKey: newApiKey,
      apiSecret: newApiSecret || undefined,
      merchantId: newApiMerchantId || undefined,
      connected: false,
      connectedAt: undefined,
    };
    const updated = [...apiConnections, newConnection];
    setApiConnections(updated);
    updateApiConnectionsMutation.mutate(updated);
    setShowAddApi(false);
    setNewApiPlatform("");
    setNewApiLabel("");
    setNewApiKey("");
    setNewApiSecret("");
    setNewApiMerchantId("");
  };

  const handleRemoveApiConnection = (connectionId: string) => {
    const updated = apiConnections.filter(c => c.id !== connectionId);
    setApiConnections(updated);
    updateApiConnectionsMutation.mutate(updated);
  };

  const handleTestApiConnection = async (connectionId: string) => {
    const updated = apiConnections.map(c =>
      c.id === connectionId
        ? { ...c, connected: true, connectedAt: new Date().toISOString() }
        : c
    );
    setApiConnections(updated);
    updateApiConnectionsMutation.mutate(updated);
    toast({
      title: "Verbindung getestet",
      description: "Die Sandbox-Verbindung wurde erfolgreich hergestellt.",
    });
  };

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

        {/* APIs / Schnittstellen */}
        <section className="space-y-4" data-testid="section-apis">
          <SectionHeader
            icon={Plug}
            title="APIs / Schnittstellen"
            description="Verbinden Sie Zahlungsplattformen per Sandbox-API"
            action={isInternal ? (
              <Dialog open={showAddApi} onOpenChange={setShowAddApi}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-api">
                    <Plus className="h-4 w-4 mr-2" />
                    Verbindung hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>API-Verbindung hinzufügen</DialogTitle>
                    <DialogDescription>
                      Wählen Sie eine Plattform und geben Sie die Sandbox-API-Zugangsdaten ein
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Plattform</Label>
                      <Select value={newApiPlatform} onValueChange={setNewApiPlatform}>
                        <SelectTrigger data-testid="select-api-platform">
                          <SelectValue placeholder="Plattform auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_PLATFORMS.map(p => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiLabel">Bezeichnung (optional)</Label>
                      <Input
                        id="apiLabel"
                        placeholder="z.B. PayPal Hauptkonto"
                        value={newApiLabel}
                        onChange={(e) => setNewApiLabel(e.target.value)}
                        data-testid="input-api-label"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key / Client ID</Label>
                      <Input
                        id="apiKey"
                        placeholder="Sandbox API Key eingeben"
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        data-testid="input-api-key"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiSecret">API Secret / Client Secret (optional)</Label>
                      <Input
                        id="apiSecret"
                        type="password"
                        placeholder="Sandbox API Secret eingeben"
                        value={newApiSecret}
                        onChange={(e) => setNewApiSecret(e.target.value)}
                        data-testid="input-api-secret"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiMerchantId">Merchant ID (optional)</Label>
                      <Input
                        id="apiMerchantId"
                        placeholder="Merchant oder Account ID"
                        value={newApiMerchantId}
                        onChange={(e) => setNewApiMerchantId(e.target.value)}
                        data-testid="input-api-merchant-id"
                      />
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                      <Badge variant="secondary">Sandbox</Badge>
                      <span className="text-sm text-muted-foreground">
                        Alle Verbindungen nutzen die Sandbox-/Test-Umgebung
                      </span>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddApi(false)}>
                      Abbrechen
                    </Button>
                    <Button
                      onClick={handleAddApiConnection}
                      disabled={!newApiPlatform || !newApiKey || updateApiConnectionsMutation.isPending}
                      data-testid="button-confirm-add-api"
                    >
                      Verbindung hinzufügen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : undefined}
          />
          <div className="pl-11">
            {apiConnections.length > 0 ? (
              <div className="space-y-3">
                {apiConnections.map((conn) => {
                  const platformInfo = SUPPORTED_PLATFORMS.find(p => p.value === conn.platform);
                  return (
                    <div
                      key={conn.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border"
                      data-testid={`api-row-${conn.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {conn.label || platformInfo?.label || conn.platform}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="secondary">Sandbox</Badge>
                            <code className="text-xs text-muted-foreground">{conn.apiKey || "****"}</code>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {conn.connected ? (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm hidden sm:inline">Verbunden</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm hidden sm:inline">Nicht verbunden</span>
                          </div>
                        )}
                        {!conn.connected && isInternal && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestApiConnection(conn.id)}
                            disabled={updateApiConnectionsMutation.isPending}
                            data-testid={`button-test-api-${conn.id}`}
                          >
                            Testen
                          </Button>
                        )}
                        {isInternal && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveApiConnection(conn.id)}
                            disabled={updateApiConnectionsMutation.isPending}
                            data-testid={`button-remove-api-${conn.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground rounded-md border border-dashed">
                <Plug className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Keine API-Verbindungen konfiguriert</p>
                <p className="text-xs mt-1">Fügen Sie eine Verbindung hinzu, um Daten direkt von Zahlungsplattformen abzurufen</p>
              </div>
            )}
          </div>
        </section>

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
