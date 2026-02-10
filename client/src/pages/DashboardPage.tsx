import { useState, useMemo } from "react";
import { Calendar, TrendingUp, Globe, DollarSign, CreditCard, PlayCircle, CheckCircle2, Circle, ListTodo, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import type { Mandant, DashboardConfig, Process, ProcessExecution } from "@shared/schema";
import { defaultDashboardConfig } from "@shared/schema";

interface DashboardPageProps {
  mandantId: string | null;
}

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface ProcessTodo {
  process: Process;
  completed: boolean;
  lastExecution?: ProcessExecution;
}

function computeProcessTodos(
  processes: Process[],
  executions: ProcessExecution[],
): ProcessTodo[] {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentQuarter = getCurrentQuarter();
  const currentWeek = getWeekNumber(now);

  return processes.map((process) => {
    const frequency = (process as any).executionFrequency || "monthly";

    const completedExecution = executions.find((e) => {
      if (e.processId !== process.id) return false;
      if (e.status !== "completed") return false;

      switch (frequency) {
        case "weekly":
          if (!e.executedAt) return false;
          const execDate = new Date(e.executedAt);
          return (
            getWeekNumber(execDate) === currentWeek &&
            execDate.getFullYear() === currentYear
          );
        case "monthly":
          return e.month === currentMonth && e.year === currentYear;
        case "quarterly":
          return e.quarter === currentQuarter && e.year === currentYear;
        case "yearly":
          return e.year === currentYear;
        default:
          return e.month === currentMonth && e.year === currentYear;
      }
    });

    return {
      process,
      completed: !!completedExecution,
      lastExecution: completedExecution,
    };
  });
}

function getFrequencyLabel(frequency: string): string {
  switch (frequency) {
    case "weekly": return "Wöchentlich";
    case "monthly": return "Monatlich";
    case "quarterly": return "Quartalsweise";
    case "yearly": return "Jährlich";
    default: return "Monatlich";
  }
}

function getCurrentPeriodLabel(): string {
  const now = new Date();
  const monthNames = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
  ];
  return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DashboardPage({ mandantId }: DashboardPageProps) {
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");

  const { data: mandanten } = useQuery<Mandant[]>({
    queryKey: ["/api/mandanten"],
  });

  const mandant = mandanten?.find(m => m.id === mandantId);
  const config: DashboardConfig = {
    ...defaultDashboardConfig,
    ...(mandant?.dashboardConfig || {}),
  };

  const needsExecutions = config.showProcessExecutions || config.showProcessTodos || 
                          config.showTransactions || config.showRevenue || config.showPayments ||
                          config.showTotalRevenue;

  const { data: executions } = useQuery<ProcessExecution[]>({
    queryKey: [`/api/process-executions?mandantId=${mandantId}`],
    enabled: !!mandantId && needsExecutions,
  });

  const { data: processes } = useQuery<Process[]>({
    queryKey: [`/api/processes?mandantId=${mandantId}`],
    enabled: !!mandantId && (config.showProcessTodos || config.showRevenue || config.showPayments || config.showTransactions || config.showTotalRevenue),
  });

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const filteredExecutions = useMemo(() => {
    if (!executions) return [];
    if (viewMode === "monthly") {
      return executions.filter(e => e.month === currentMonth && e.year === currentYear && e.status === "completed");
    }
    return executions.filter(e => e.year === currentYear && e.status === "completed");
  }, [executions, viewMode, currentMonth, currentYear]);

  const executionsThisMonth = executions?.filter(e => {
    return e.month === currentMonth && e.year === currentYear;
  }) || [];

  const executionsThisYear = executions?.filter(e => {
    return e.year === currentYear;
  }) || [];

  const metrics = useMemo(() => {
    if (!processes || !filteredExecutions.length) {
      return { totalRevenue: 0, totalPayments: 0, totalTransactions: 0 };
    }

    const processMap = new Map(processes.map(p => [p.id, p]));
    let totalRevenue = 0;
    let totalPayments = 0;
    let totalTransactions = 0;

    for (const exec of filteredExecutions) {
      const proc = processMap.get(exec.processId);
      const processType = (proc as any)?.processType || "umsatz";
      const amount = exec.totalAmount ? parseFloat(exec.totalAmount) : 0;
      
      if (processType === "umsatz") {
        totalRevenue += amount;
      } else if (processType === "zahlung") {
        totalPayments += amount;
      }
      totalTransactions += exec.transactionCount || 0;
    }

    return { totalRevenue, totalPayments, totalTransactions };
  }, [processes, filteredExecutions]);

  const processTodos = useMemo(() => {
    if (!processes || !executions) return [];
    return computeProcessTodos(processes, executions);
  }, [processes, executions]);

  const completedCount = processTodos.filter(t => t.completed).length;
  const totalCount = processTodos.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
                       config.showProcessExecutions ||
                       config.showProcessTodos ||
                       config.showTransactions ||
                       config.showRevenue ||
                       config.showPayments;

  const periodLabel = viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr";

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Übersicht für {mandant?.name || "das ausgewählte Mandat"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-1" data-testid="view-mode-switcher">
          <Button
            variant={viewMode === "monthly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("monthly")}
            data-testid="button-view-monthly"
          >
            Monat
          </Button>
          <Button
            variant={viewMode === "yearly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("yearly")}
            data-testid="button-view-yearly"
          >
            Jahr
          </Button>
        </div>
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
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {config.showRevenue && (
              <Card data-testid="card-revenue">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Umsatz</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-revenue-value">
                    {formatCurrency(metrics.totalRevenue)} EUR
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel} (aus Umsatz-Prozessen)
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showPayments && (
              <Card data-testid="card-payments">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Zahlungen</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-payments-value">
                    {formatCurrency(metrics.totalPayments)} EUR
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel} (aus Zahlungs-Prozessen)
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showTransactions && (
              <Card data-testid="card-transactions">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Buchungen</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-transactions-value">
                    {metrics.totalTransactions.toLocaleString("de-DE")}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel}
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showTotalRevenue && (
              <Card data-testid="card-total-revenue">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-revenue-value">
                    {formatCurrency(metrics.totalRevenue)} EUR
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel}
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showRevenueByPlatform && (
              <Card data-testid="card-revenue-platform">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Umsatz nach Plattform</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Keine Daten verfügbar
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {periodLabel}
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showRevenueByCountry && (
              <Card data-testid="card-revenue-country">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Umsatz nach Ländern</CardTitle>
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Keine Daten verfügbar
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {periodLabel}
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showRevenueByCurrency && (
              <Card data-testid="card-revenue-currency">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Umsatz nach Währungen</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Keine Daten verfügbar
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {periodLabel}
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showProcessExecutions && (
              <Card data-testid="card-process-executions">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ausgeführte Prozesse</CardTitle>
                  <PlayCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {viewMode === "monthly" 
                      ? executionsThisMonth.length 
                      : executionsThisYear.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel}
                  </p>
                </CardContent>
              </Card>
            )}

            {config.showProcessTodos && totalCount > 0 && (
              <Card data-testid="card-process-progress">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Fortschritt</CardTitle>
                  <ListTodo className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{completedCount} / {totalCount}</div>
                  <Progress value={progressPercent} className="mt-2 h-2" data-testid="progress-bar" />
                  <p className="text-xs text-muted-foreground mt-2">
                    Prozesse in der aktuellen Periode abgeschlossen
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {config.showProcessTodos && processTodos.length > 0 && (
            <Card data-testid="card-process-todos">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-medium">Prozess-Aufgaben — {getCurrentPeriodLabel()}</CardTitle>
                <Badge variant="secondary" className="text-xs" data-testid="badge-todo-progress">
                  {completedCount}/{totalCount} erledigt
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {processTodos.map((todo) => (
                    <div
                      key={todo.process.id}
                      className="flex items-center gap-3"
                      data-testid={`todo-process-${todo.process.id}`}
                    >
                      {todo.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400 shrink-0" data-testid={`icon-completed-${todo.process.id}`} />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground shrink-0" data-testid={`icon-pending-${todo.process.id}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${todo.completed ? "line-through text-muted-foreground" : ""}`}>
                          {todo.process.name}
                        </p>
                        {todo.process.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {todo.process.description}
                          </p>
                        )}
                      </div>
                      <Badge variant={todo.completed ? "secondary" : "outline"} className="shrink-0 text-xs">
                        {getFrequencyLabel((todo.process as any).executionFrequency || "monthly")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {config.showProcessTodos && processTodos.length === 0 && processes && (
            <Card data-testid="card-process-todos-empty">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-medium">Prozess-Aufgaben</CardTitle>
                <ListTodo className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">Keine Prozesse für dieses Mandat vorhanden</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
