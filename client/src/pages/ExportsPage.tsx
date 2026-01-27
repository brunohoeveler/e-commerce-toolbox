import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, FileDown, FileSpreadsheet, Clock, CheckCircle2, Receipt, Euro, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ProcessExecution, ExportRecord, Process } from "@shared/schema";

interface ExportsPageProps {
  mandantId: string | null;
}

export function ExportsPage({ mandantId }: ExportsPageProps) {
  const { toast } = useToast();
  const [selectedFormats, setSelectedFormats] = useState<Record<string, "ascii" | "datev">>({});
  const [selectedDelimiters, setSelectedDelimiters] = useState<Record<string, "comma" | "semicolon" | "tab">>({});

  const { data: processes } = useQuery<Process[]>({
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

  const { data: completedExecutions, isLoading: executionsLoading } = useQuery<ProcessExecution[]>({
    queryKey: ["/api/process-executions/completed", mandantId],
    queryFn: async () => {
      const res = await fetch(`/api/process-executions/completed?mandantId=${mandantId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch executions");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const { data: exportRecords, isLoading: exportsLoading } = useQuery<ExportRecord[]>({
    queryKey: ["/api/exports", mandantId],
    queryFn: async () => {
      const res = await fetch(`/api/exports?mandantId=${mandantId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch exports");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const exportMutation = useMutation({
    mutationFn: async ({ executionId, format, delimiter }: { executionId: string; format: "ascii" | "datev"; delimiter?: "comma" | "semicolon" | "tab" }) => {
      const response = await apiRequest("POST", `/api/exports`, {
        processExecutionId: executionId,
        format,
        delimiter: format === "ascii" ? (delimiter || "semicolon") : undefined,
        mandantId,
      });
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Export erstellt",
        description: "Die Datei wird heruntergeladen.",
      });
      if (data && typeof data === 'object' && 'downloadUrl' in data) {
        const link = document.createElement('a');
        link.href = data.downloadUrl as string;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Export konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const getProcessInfo = (processId: string) => {
    return processes?.find(p => p.id === processId);
  };

  const hasFileInputs = (execution: ProcessExecution) => {
    const process = getProcessInfo(execution.processId);
    if (!process) return false;
    const inputFileSlots = process.inputFileSlots as Array<{ id: string; name: string; type?: string }> | null;
    if (!inputFileSlots || inputFileSlots.length === 0) return false;
    const hasFileSlot = inputFileSlots.some(slot => slot.type !== 'manual');
    return hasFileSlot;
  };

  const fileBasedExecutions = completedExecutions?.filter(hasFileInputs) || [];

  const handleExport = (executionId: string) => {
    const format = selectedFormats[executionId] || "ascii";
    const delimiter = selectedDelimiters[executionId] || "semicolon";
    exportMutation.mutate({ executionId, format, delimiter });
  };

  const handleDownloadExport = (exportId: string) => {
    window.open(`/api/exports/${exportId}/download`, "_blank");
  };

  const isLoading = executionsLoading || exportsLoading;

  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Download className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Kein Mandat ausgewählt</h3>
            <p className="text-muted-foreground">
              Bitte wählen Sie ein Mandat aus der Seitenleiste, um Exporte anzuzeigen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Exporte</h1>
        <p className="text-muted-foreground">
          Exportieren Sie verarbeitete Daten als CSV im ASCII- oder DATEV-Format
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-chart-2" />
              Prozess-Exporte
            </CardTitle>
            <CardDescription>
              Abgeschlossene Prozesse mit Datei-Input als CSV exportieren (Separator: ";")
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : fileBasedExecutions.length > 0 ? (
              <div className="space-y-3">
                {fileBasedExecutions.map((execution) => {
                  const process = getProcessInfo(execution.processId);
                  return (
                    <div
                      key={execution.id}
                      className="flex items-center justify-between rounded-md border border-border p-4"
                      data-testid={`export-item-${execution.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{process?.name || "Prozess"}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{execution.month}/{execution.year}</span>
                            <span>•</span>
                            <span>{execution.transactionCount || 0} Transaktionen</span>
                            {execution.totalAmount && (
                              <>
                                <span>•</span>
                                <span>{parseFloat(execution.totalAmount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedFormats[execution.id] || "ascii"}
                          onValueChange={(value) => 
                            setSelectedFormats(prev => ({ ...prev, [execution.id]: value as "ascii" | "datev" }))
                          }
                        >
                          <SelectTrigger className="w-36" data-testid={`select-export-format-${execution.id}`}>
                            <SelectValue placeholder="Format wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ascii">ASCII (CSV)</SelectItem>
                            <SelectItem value="datev">DATEV Format</SelectItem>
                          </SelectContent>
                        </Select>
                        {(selectedFormats[execution.id] || "ascii") === "ascii" && (
                          <Select
                            value={selectedDelimiters[execution.id] || "semicolon"}
                            onValueChange={(value) => 
                              setSelectedDelimiters(prev => ({ ...prev, [execution.id]: value as "comma" | "semicolon" | "tab" }))
                            }
                          >
                            <SelectTrigger className="w-32" data-testid={`select-delimiter-${execution.id}`}>
                              <SelectValue placeholder="Trennzeichen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="semicolon">Semikolon (;)</SelectItem>
                              <SelectItem value="comma">Komma (,)</SelectItem>
                              <SelectItem value="tab">Tabulator</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Button 
                          onClick={() => handleExport(execution.id)}
                          disabled={exportMutation.isPending}
                          data-testid={`button-export-${execution.id}`}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Exportieren
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Keine exportierbaren Prozesse</p>
                <p className="text-sm">Führen Sie zuerst Prozesse mit Datei-Input aus</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-chart-4" />
              Umsatzsteuerliche Exporte
            </CardTitle>
            <CardDescription>
              Zusätzliche Downloads für den umsatzsteuerlichen Bereich
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <Receipt className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">
                Umsatzsteuerliche Exporte werden nach Abschluss bestimmter Prozesse verfügbar
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span>Diese Funktion wird in Kürze freigeschaltet</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              Export-Verlauf
            </CardTitle>
            <CardDescription>
              Frühere Exporte erneut herunterladen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : exportRecords && exportRecords.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exportRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {record.format.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {record.exportedAt ? new Date(record.exportedAt).toLocaleDateString("de-DE") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDownloadExport(record.id)}
                          data-testid={`button-download-${record.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileDown className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Noch keine Exporte</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
