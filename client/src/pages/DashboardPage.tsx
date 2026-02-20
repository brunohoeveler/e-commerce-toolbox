import { useState, useMemo, useCallback } from "react";
import { Calendar, TrendingUp, Globe, DollarSign, CreditCard, PlayCircle, CheckCircle2, Circle, ListTodo, FileText, GripVertical, Pencil, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Mandant, DashboardConfig, Process, ProcessExecution } from "@shared/schema";
import { defaultDashboardConfig, normalizeDashboardConfig } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const ALL_CARD_IDS = [
  "revenue",
  "payments",
  "openPayments",
  "transactions",
  "totalRevenue",
  "revenueByPlatform",
  "revenueByCountry",
  "revenueByCurrency",
  "processExecutions",
  "processProgress",
  "processTodos",
  "processTodosEmpty",
] as const;

type CardId = typeof ALL_CARD_IDS[number];

function SortableCard({ id, isEditMode, children }: { id: string; isEditMode: boolean; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {isEditMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing p-1 rounded-md bg-muted/80"
          data-testid={`drag-handle-${id}`}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {children}
    </div>
  );
}

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
  const [isEditMode, setIsEditMode] = useState(false);
  const [localCardOrder, setLocalCardOrder] = useState<string[] | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveOrderMutation = useMutation({
    mutationFn: async (newOrder: string[]) => {
      if (!mandant) return;
      const updatedConfig = { ...config, cardOrder: newOrder };
      await apiRequest("PATCH", `/api/mandanten/${mandant.id}`, {
        dashboardConfig: updatedConfig,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
      toast({ title: "Dashboard-Reihenfolge gespeichert" });
    },
  });

  const { data: mandanten } = useQuery<Mandant[]>({
    queryKey: ["/api/mandanten"],
  });

  const mandant = mandanten?.find(m => m.id === mandantId);
  const config: DashboardConfig = normalizeDashboardConfig(mandant?.dashboardConfig);

  const needsExecutions = config.showProcessExecutions || config.showProcessTodos || 
                          config.showTransactions || config.showRevenue || config.showPayments ||
                          config.showTotalRevenue || config.showOpenPayments ||
                          config.showRevenueByPlatform || config.showRevenueByCountry || config.showRevenueByCurrency;

  const { data: executions } = useQuery<ProcessExecution[]>({
    queryKey: [`/api/process-executions?mandantId=${mandantId}`],
    enabled: !!mandantId && needsExecutions,
  });

  const { data: processes } = useQuery<Process[]>({
    queryKey: [`/api/processes?mandantId=${mandantId}`],
    enabled: !!mandantId && (config.showProcessTodos || config.showRevenue || config.showPayments || config.showTransactions || config.showTotalRevenue || config.showOpenPayments || config.showRevenueByPlatform || config.showRevenueByCountry || config.showRevenueByCurrency),
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
      return { 
        totalRevenue: 0, totalPayments: 0, totalTransactions: 0,
        countryBreakdown: {} as Record<string, number>,
        currencyBreakdown: {} as Record<string, number>,
        platformBreakdown: {} as Record<string, number>,
      };
    }

    const processMap = new Map(processes.map(p => [p.id, p]));
    let totalRevenue = 0;
    let totalPayments = 0;
    let totalTransactions = 0;
    const countryBreakdown: Record<string, number> = {};
    const currencyBreakdown: Record<string, number> = {};
    const platformBreakdown: Record<string, number> = {};

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

      if (processType === "umsatz") {
        const execCountry = (exec as any).countryBreakdown as Record<string, number> | null;
        if (execCountry) {
          for (const [key, val] of Object.entries(execCountry)) {
            countryBreakdown[key] = (countryBreakdown[key] || 0) + val;
          }
        }

        const execCurrency = (exec as any).currencyBreakdown as Record<string, number> | null;
        if (execCurrency) {
          for (const [key, val] of Object.entries(execCurrency)) {
            currencyBreakdown[key] = (currencyBreakdown[key] || 0) + val;
          }
        }

        const execPlatform = (exec as any).platformBreakdown as Record<string, number> | null;
        if (execPlatform) {
          for (const [key, val] of Object.entries(execPlatform)) {
            platformBreakdown[key] = (platformBreakdown[key] || 0) + val;
          }
        }
      }
    }

    return { totalRevenue, totalPayments, totalTransactions, countryBreakdown, currencyBreakdown, platformBreakdown };
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
                       config.showPayments ||
                       config.showOpenPayments;

  const periodLabel = viewMode === "monthly" ? "Diesen Monat" : "Dieses Jahr";

  const getVisibleCardIds = useCallback((): CardId[] => {
    const visible: CardId[] = [];
    if (config.showRevenue) visible.push("revenue");
    if (config.showPayments) visible.push("payments");
    if (config.showOpenPayments) visible.push("openPayments");
    if (config.showTransactions) visible.push("transactions");
    if (config.showTotalRevenue) visible.push("totalRevenue");
    if (config.showRevenueByPlatform) visible.push("revenueByPlatform");
    if (config.showRevenueByCountry) visible.push("revenueByCountry");
    if (config.showRevenueByCurrency) visible.push("revenueByCurrency");
    if (config.showProcessExecutions) visible.push("processExecutions");
    if (config.showProcessTodos && totalCount > 0) visible.push("processProgress");
    if (config.showProcessTodos && processTodos.length > 0) visible.push("processTodos");
    if (config.showProcessTodos && processTodos.length === 0 && processes) visible.push("processTodosEmpty");
    return visible;
  }, [config, totalCount, processTodos, processes]);

  const orderedCardIds = useMemo(() => {
    const visible = getVisibleCardIds();
    const savedOrder = localCardOrder || config.cardOrder;
    if (!savedOrder || savedOrder.length === 0) return visible;
    const ordered: CardId[] = [];
    for (const id of savedOrder) {
      if (visible.includes(id as CardId)) ordered.push(id as CardId);
    }
    for (const id of visible) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return ordered;
  }, [getVisibleCardIds, config.cardOrder, localCardOrder]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedCardIds.indexOf(active.id as CardId);
    const newIndex = orderedCardIds.indexOf(over.id as CardId);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(orderedCardIds, oldIndex, newIndex);
    setLocalCardOrder(newOrder);
  }

  function handleToggleEditMode() {
    if (isEditMode) {
      const orderToSave = localCardOrder || orderedCardIds;
      saveOrderMutation.mutate(orderToSave);
      setIsEditMode(false);
      setLocalCardOrder(null);
    } else {
      setLocalCardOrder([...orderedCardIds]);
      setIsEditMode(true);
    }
  }

  function renderCard(cardId: CardId): React.ReactNode {
    switch (cardId) {
      case "revenue":
        return (
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
        );
      case "payments":
        return (
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
        );
      case "openPayments":
        return (
          <Card data-testid="card-open-payments">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offene Zahlungen</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-open-payments-value">
                {formatCurrency(metrics.totalRevenue - metrics.totalPayments)} EUR
              </div>
              <p className="text-xs text-muted-foreground">
                {periodLabel} (Umsätze - Zahlungen)
              </p>
            </CardContent>
          </Card>
        );
      case "transactions":
        return (
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
        );
      case "totalRevenue":
        return (
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
        );
      case "revenueByPlatform":
        return (
          <Card data-testid="card-revenue-platform">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Umsatz nach Plattform</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {Object.keys(metrics.platformBreakdown).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.platformBreakdown)
                    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                    .map(([platform, amount]) => (
                    <div key={platform} className="flex items-center justify-between gap-2" data-testid={`platform-row-${platform}`}>
                      <span className="text-sm truncate">{platform}</span>
                      <span className="text-sm font-medium whitespace-nowrap">{formatCurrency(amount)} EUR</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Keine Daten verfügbar
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {periodLabel}
              </p>
            </CardContent>
          </Card>
        );
      case "revenueByCountry":
        return (
          <Card data-testid="card-revenue-country">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Umsatz nach Ländern</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {Object.keys(metrics.countryBreakdown).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.countryBreakdown)
                    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                    .map(([country, amount]) => (
                    <div key={country} className="flex items-center justify-between gap-2" data-testid={`country-row-${country}`}>
                      <span className="text-sm truncate">{country}</span>
                      <span className="text-sm font-medium whitespace-nowrap">{formatCurrency(amount)} EUR</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Keine Daten verfügbar
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {periodLabel}
              </p>
            </CardContent>
          </Card>
        );
      case "revenueByCurrency":
        return (
          <Card data-testid="card-revenue-currency">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Umsatz nach Währungen</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {Object.keys(metrics.currencyBreakdown).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.currencyBreakdown)
                    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                    .map(([currency, amount]) => (
                    <div key={currency} className="flex items-center justify-between gap-2" data-testid={`currency-row-${currency}`}>
                      <span className="text-sm truncate">{currency}</span>
                      <span className="text-sm font-medium whitespace-nowrap">{formatCurrency(amount)} {currency}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Keine Daten verfügbar
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {periodLabel}
              </p>
            </CardContent>
          </Card>
        );
      case "processExecutions":
        return (
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
        );
      case "processProgress":
        return (
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
        );
      case "processTodos":
        return (
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
        );
      case "processTodosEmpty":
        return (
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
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Übersicht für {mandant?.name || "das ausgewählte Mandat"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasAnyWidget && mandant && (
            <Button
              variant={isEditMode ? "default" : "outline"}
              size="sm"
              onClick={handleToggleEditMode}
              disabled={saveOrderMutation.isPending}
              data-testid="button-edit-dashboard"
            >
              {isEditMode ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Fertig
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4 mr-1" />
                  Anordnen
                </>
              )}
            </Button>
          )}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedCardIds} strategy={rectSortingStrategy}>
            <div className={isEditMode ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "columns-1 md:columns-2 lg:columns-3 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid"}>
              {orderedCardIds.map((cardId) => {
                const cardContent = renderCard(cardId);
                if (!cardContent) return null;
                return (
                  <SortableCard key={cardId} id={cardId} isEditMode={isEditMode}>
                    {cardContent}
                  </SortableCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
