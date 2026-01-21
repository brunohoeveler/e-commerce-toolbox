import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCheck,
  FileClock,
  FileX,
  TrendingUp,
  Calendar,
  ChevronDown,
  Euro,
  ArrowRightLeft,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { Process, ProcessExecution } from "@shared/schema";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

interface DashboardPageProps {
  mandantId: string | null;
}

export function DashboardPage({ mandantId }: DashboardPageProps) {
  const currentDate = new Date();
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedYear] = useState(currentDate.getFullYear());

  const { data: processes, isLoading: processesLoading } = useQuery<Process[]>({
    queryKey: ["/api/processes", mandantId],
    queryFn: async () => {
      const res = await fetch(`/api/processes?mandantId=${mandantId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch processes");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const { data: executions, isLoading: executionsLoading } = useQuery<ProcessExecution[]>({
    queryKey: ["/api/process-executions", mandantId, selectedMonth + 1, selectedYear, viewMode],
    queryFn: async () => {
      const month = viewMode === "month" ? selectedMonth + 1 : undefined;
      const url = `/api/process-executions?mandantId=${mandantId}${month ? `&month=${month}&year=${selectedYear}` : `&year=${selectedYear}`}`;
      const res = await fetch(url, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch executions");
      return res.json();
    },
    enabled: !!mandantId,
  });

  interface FinancialSummary {
    totalRevenue: number;
    totalPayments: number;
    revenueByCountry: Record<string, number>;
    paymentsByCountry: Record<string, number>;
    difference: number;
    ratio: string;
  }

  const { data: financialSummary, isLoading: financialLoading } = useQuery<FinancialSummary>({
    queryKey: ["/api/financial-summary", mandantId, selectedMonth + 1, selectedYear, viewMode],
    queryFn: async () => {
      const month = viewMode === "month" ? selectedMonth + 1 : undefined;
      const url = `/api/financial-summary?mandantId=${mandantId}${month ? `&month=${month}&year=${selectedYear}` : `&year=${selectedYear}`}`;
      const res = await fetch(url, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch financial summary");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const isLoading = processesLoading || executionsLoading || financialLoading;

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

  const completedExecutions = executions?.filter(e => e.status === "completed") || [];
  const pendingExecutions = executions?.filter(e => e.status === "pending") || [];
  const failedExecutions = executions?.filter(e => e.status === "failed") || [];
  
  const revenueProcessIds = new Set(
    processes?.filter(p => p.processType === "revenue").map(p => p.id) || []
  );
  const totalTransactions = executions?.reduce((sum, e) => {
    if (revenueProcessIds.has(e.processId)) {
      return sum + (e.transactionCount || 0);
    }
    return sum;
  }, 0) || 0;
  
  const totalProcesses = processes?.length || 0;
  const completionRate = totalProcesses > 0 
    ? Math.round((completedExecutions.length / totalProcesses) * 100) 
    : 0;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Übersicht über Ihre Prozesse und Transaktionen
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border">
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("month")}
              className="rounded-r-none"
              data-testid="button-view-month"
            >
              Monat
            </Button>
            <Button
              variant={viewMode === "year" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("year")}
              className="rounded-l-none"
              data-testid="button-view-year"
            >
              Jahr
            </Button>
          </div>

          {viewMode === "month" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="dropdown-month-select">
                  {MONTHS[selectedMonth]} {selectedYear}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {MONTHS.map((month, index) => (
                  <DropdownMenuItem
                    key={month}
                    onClick={() => setSelectedMonth(index)}
                    data-testid={`menu-item-month-${index}`}
                  >
                    {month}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaktionen</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{totalTransactions.toLocaleString("de-DE")}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {viewMode === "month" ? `Im ${MONTHS[selectedMonth]}` : `Im Jahr ${selectedYear}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abgeschlossen</CardTitle>
            <FileCheck className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-chart-2">{completedExecutions.length}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Prozesse erfolgreich durchgeführt
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ausstehend</CardTitle>
            <FileClock className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-chart-3">{pendingExecutions.length}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Prozesse noch offen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fehlgeschlagen</CardTitle>
            <FileX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-destructive">{failedExecutions.length}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Benötigen Überprüfung
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Umsatzerlöse</CardTitle>
            <Euro className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold text-chart-2" data-testid="text-total-revenue">
                {(financialSummary?.totalRevenue || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Erfasste Umsätze
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zahlungseingänge</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold text-primary" data-testid="text-total-payments">
                {(financialSummary?.totalPayments || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Eingegangene Zahlungen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verhältnis</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-payment-ratio">
                {financialSummary?.ratio || 0}%
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Zahlungen / Umsatz
            </p>
          </CardContent>
        </Card>
      </div>

      {financialSummary && (Object.keys(financialSummary.revenueByCountry || {}).length > 0 || Object.keys(financialSummary.paymentsByCountry || {}).length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {Object.keys(financialSummary.revenueByCountry || {}).length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-chart-2" />
                  Umsatz nach Ländern
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(financialSummary.revenueByCountry)
                    .sort(([, a], [, b]) => b - a)
                    .map(([country, amount]) => (
                      <div key={country} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                        <span className="font-medium">{country}</span>
                        <span className="text-sm font-medium text-chart-2">
                          {amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {Object.keys(financialSummary.paymentsByCountry || {}).length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Zahlungen nach Ländern
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(financialSummary.paymentsByCountry)
                    .sort(([, a], [, b]) => b - a)
                    .map(([country, amount]) => (
                      <div key={country} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                        <span className="font-medium">{country}</span>
                        <span className="text-sm font-medium text-primary">
                          {amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prozess-Fortschritt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : processes && processes.length > 0 ? (
              processes.map((process) => {
                const execution = executions?.find(e => e.processId === process.id);
                const status = execution?.status || "pending";
                return (
                  <div key={process.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{process.name}</span>
                      <Badge
                        variant={
                          status === "completed" ? "default" :
                          status === "failed" ? "destructive" : "secondary"
                        }
                        data-testid={`badge-process-status-${process.id}`}
                      >
                        {status === "completed" ? "Erledigt" :
                         status === "failed" ? "Fehler" : "Ausstehend"}
                      </Badge>
                    </div>
                    <Progress
                      value={status === "completed" ? 100 : status === "failed" ? 0 : 50}
                      className="h-2"
                    />
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Noch keine Prozesse angelegt</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gesamtfortschritt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative h-32 w-32">
                <svg className="h-32 w-32 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-muted"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    strokeDasharray={`${completionRate * 2.51} 251`}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">{completionRate}%</span>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground text-center">
                {completedExecutions.length} von {totalProcesses} Prozessen abgeschlossen
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
