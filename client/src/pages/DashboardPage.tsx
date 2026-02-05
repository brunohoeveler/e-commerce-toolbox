import { Calendar, TrendingUp, Globe, DollarSign, CreditCard, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { Mandant, DashboardConfig } from "@shared/schema";
import { defaultDashboardConfig } from "@shared/schema";

interface DashboardPageProps {
  mandantId: string | null;
}

export function DashboardPage({ mandantId }: DashboardPageProps) {
  const { data: mandanten } = useQuery<Mandant[]>({
    queryKey: ["/api/mandanten"],
  });

  const mandant = mandanten?.find(m => m.id === mandantId);
  const config: DashboardConfig = mandant?.dashboardConfig || defaultDashboardConfig;

  const { data: executions } = useQuery<any[]>({
    queryKey: ["/api/process-executions", mandantId],
    queryFn: async () => {
      const res = await fetch(`/api/process-executions?mandantId=${mandantId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch executions");
      return res.json();
    },
    enabled: !!mandantId && config.showProcessExecutions,
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const executionsThisMonth = executions?.filter(e => {
    const date = new Date(e.executedAt);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }) || [];

  const executionsThisYear = executions?.filter(e => {
    const date = new Date(e.executedAt);
    return date.getFullYear() === currentYear;
  }) || [];

  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Kein Mandat ausgewählt</h3>
            <p className="text-muted-foreground">
              Bitte wählen Sie ein Mandat aus der Seitenleiste, um das Dashboard anzuzeigen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAnyWidget = config.showTotalRevenue || 
                       config.showRevenueByPlatform || 
                       config.showRevenueByCountry || 
                       config.showRevenueByCurrency || 
                       config.showProcessExecutions;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Übersicht für {mandant?.name || "das ausgewählte Mandat"}
          </p>
        </div>
        <Badge variant="secondary" data-testid="badge-view-mode">
          {config.viewMode === "monthly" ? "Monatsansicht" : "Jahresansicht"}
        </Badge>
      </div>

      {!hasAnyWidget ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground">
              Keine Dashboard-Elemente aktiviert. Konfigurieren Sie die Anzeige in den Mandant-Einstellungen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {config.showTotalRevenue && (
            <Card data-testid="card-total-revenue">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">€ 0,00</div>
                <p className="text-xs text-muted-foreground">
                  {config.viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr"}
                </p>
              </CardContent>
            </Card>
          )}

          {config.showRevenueByPlatform && (
            <Card data-testid="card-revenue-platform">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Umsatz nach Plattform</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Keine Daten verfügbar
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {config.viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr"}
                </p>
              </CardContent>
            </Card>
          )}

          {config.showRevenueByCountry && (
            <Card data-testid="card-revenue-country">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Umsatz nach Ländern</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Keine Daten verfügbar
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {config.viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr"}
                </p>
              </CardContent>
            </Card>
          )}

          {config.showRevenueByCurrency && (
            <Card data-testid="card-revenue-currency">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Umsatz nach Währungen</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Keine Daten verfügbar
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {config.viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr"}
                </p>
              </CardContent>
            </Card>
          )}

          {config.showProcessExecutions && (
            <Card data-testid="card-process-executions">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ausgeführte Prozesse</CardTitle>
                <PlayCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {config.viewMode === "monthly" 
                    ? executionsThisMonth.length 
                    : executionsThisYear.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {config.viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
