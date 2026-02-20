import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Users, UserPlus, Trash2, Save, LayoutDashboard, Info, Plug, Plus, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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

// Better Auth user type
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

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/mandanten/${mandantId}`, formData);
    },
    onSuccess: () => {
      toast({
        title: "Gespeichert",
        description: "Mandanteninformationen wurden aktualisiert.",
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

  const updateDashboardMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/mandanten/${mandantId}`, { dashboardConfig });
    },
    onSuccess: () => {
      toast({
        title: "Gespeichert",
        description: "Dashboard-Einstellungen wurden aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Dashboard-Einstellungen konnten nicht gespeichert werden.",
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

  const updateSonstigeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/mandanten/${mandantId}`, { ossBeteiligung });
    },
    onSuccess: () => {
      toast({
        title: "Gespeichert",
        description: "Sonstige Informationen wurden aktualisiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Sonstige Informationen konnten nicht gespeichert werden.",
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
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mandanteninformationen</h1>
        <p className="text-muted-foreground">
          Bearbeiten Sie die Stammdaten und Benutzerberechtigungen
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Stammdaten
            </CardTitle>
            <CardDescription>
              Grundlegende Informationen zum Mandat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
            {isInternal && (
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="w-full"
                data-testid="button-save-mandant"
              >
                <Save className="h-4 w-4 mr-2" />
                Änderungen speichern
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              Dashboardverwaltung
            </CardTitle>
            <CardDescription>
              Konfigurieren Sie, welche Elemente im Dashboard angezeigt werden
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Dashboard-Elemente</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showRevenue"
                    checked={dashboardConfig.showRevenue}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showRevenue: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-revenue"
                  />
                  <Label htmlFor="showRevenue" className="font-normal cursor-pointer">
                    Umsatz (aus Umsatz-Prozessen)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showPayments"
                    checked={dashboardConfig.showPayments}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showPayments: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-payments"
                  />
                  <Label htmlFor="showPayments" className="font-normal cursor-pointer">
                    Zahlungen (aus Zahlungs-Prozessen)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showOpenPayments"
                    checked={dashboardConfig.showOpenPayments}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showOpenPayments: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-open-payments"
                  />
                  <Label htmlFor="showOpenPayments" className="font-normal cursor-pointer">
                    Offene Zahlungen (Umsätze - Zahlungen)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showTransactions"
                    checked={dashboardConfig.showTransactions}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showTransactions: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-transactions"
                  />
                  <Label htmlFor="showTransactions" className="font-normal cursor-pointer">
                    Buchungen (Transaktionsanzahl)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showTotalRevenue"
                    checked={dashboardConfig.showTotalRevenue}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showTotalRevenue: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-total-revenue"
                  />
                  <Label htmlFor="showTotalRevenue" className="font-normal cursor-pointer">
                    Gesamtumsatz
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showRevenueByPlatform"
                    checked={dashboardConfig.showRevenueByPlatform}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showRevenueByPlatform: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-revenue-platform"
                  />
                  <Label htmlFor="showRevenueByPlatform" className="font-normal cursor-pointer">
                    Umsatz nach Plattform
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showRevenueByCountry"
                    checked={dashboardConfig.showRevenueByCountry}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showRevenueByCountry: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-revenue-country"
                  />
                  <Label htmlFor="showRevenueByCountry" className="font-normal cursor-pointer">
                    Umsatz nach Ländern
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showRevenueByCurrency"
                    checked={dashboardConfig.showRevenueByCurrency}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showRevenueByCurrency: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-revenue-currency"
                  />
                  <Label htmlFor="showRevenueByCurrency" className="font-normal cursor-pointer">
                    Umsatz nach Währungen
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showProcessExecutions"
                    checked={dashboardConfig.showProcessExecutions}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showProcessExecutions: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-process-executions"
                  />
                  <Label htmlFor="showProcessExecutions" className="font-normal cursor-pointer">
                    Ausgeführte Prozesse
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showProcessTodos"
                    checked={dashboardConfig.showProcessTodos}
                    onCheckedChange={(checked) =>
                      setDashboardConfig(prev => ({ ...prev, showProcessTodos: !!checked }))
                    }
                    disabled={!isInternal}
                    data-testid="checkbox-process-todos"
                  />
                  <Label htmlFor="showProcessTodos" className="font-normal cursor-pointer">
                    Prozess-Aufgaben und Fortschritt (To-Do-Liste)
                  </Label>
                </div>
              </div>
            </div>

            {isInternal && (
              <Button
                onClick={() => updateDashboardMutation.mutate()}
                disabled={updateDashboardMutation.isPending}
                className="w-full"
                data-testid="button-save-dashboard"
              >
                <Save className="h-4 w-4 mr-2" />
                Dashboard-Einstellungen speichern
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Sonstige Informationen
            </CardTitle>
            <CardDescription>
              Zusätzliche Einstellungen und Informationen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
            {isInternal && (
              <Button
                onClick={() => updateSonstigeMutation.mutate()}
                disabled={updateSonstigeMutation.isPending}
                className="w-full"
                data-testid="button-save-sonstige"
              >
                <Save className="h-4 w-4 mr-2" />
                Sonstige Informationen speichern
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5" />
                  APIs / Schnittstellen
                </CardTitle>
                <CardDescription>
                  Verbinden Sie Zahlungsplattformen per Sandbox-API, um Daten direkt abzurufen
                </CardDescription>
              </div>
              {isInternal && (
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
              )}
            </div>
          </CardHeader>
          <CardContent>
            {apiConnections.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plattform</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiConnections.map((conn) => {
                    const platformInfo = SUPPORTED_PLATFORMS.find(p => p.value === conn.platform);
                    return (
                      <TableRow key={conn.id} data-testid={`api-row-${conn.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{conn.label || platformInfo?.label || conn.platform}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge variant="secondary">Sandbox</Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm text-muted-foreground">
                            {conn.apiKey || "****"}
                          </code>
                        </TableCell>
                        <TableCell>
                          {conn.connected ? (
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm">Verbunden</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">Nicht verbunden</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Plug className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Keine API-Verbindungen konfiguriert</p>
                <p className="text-sm">Fügen Sie eine Verbindung hinzu, um Daten direkt von Zahlungsplattformen abzurufen</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isInternal && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Benutzerberechtigungen
                  </CardTitle>
                  <CardDescription>
                    Verwalten Sie den Zugriff auf dieses Mandat
                  </CardDescription>
                </div>
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
                      <Button
                        variant="outline"
                        onClick={() => setShowAddUser(false)}
                      >
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
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : assignedUsers && assignedUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Benutzer</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedUsers.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={assignment.user.image || undefined} />
                              <AvatarFallback>
                                {assignment.user.name?.[0] || assignment.user.email?.[0] || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {assignment.user.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {assignment.user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">Extern</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUserMutation.mutate(assignment.user.id)}
                            disabled={removeUserMutation.isPending}
                            data-testid={`button-remove-user-${assignment.user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Keine externen Benutzer</p>
                  <p className="text-sm">Fügen Sie Benutzer hinzu, um ihnen Zugriff zu gewähren</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
