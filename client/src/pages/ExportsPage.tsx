import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, FileDown, FileSpreadsheet, Clock, CheckCircle2 } from "lucide-react";
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
import type { ProcessExecution, ExportRecord } from "@shared/schema";

interface ExportsPageProps {
  mandantId: string | null;
}

export function ExportsPage({ mandantId }: ExportsPageProps) {
  const { toast } = useToast();

  const { data: completedExecutions, isLoading: executionsLoading } = useQuery<ProcessExecution[]>({
    queryKey: ["/api/process-executions/completed", mandantId],
    enabled: !!mandantId,
  });

  const { data: exportRecords, isLoading: exportsLoading } = useQuery<ExportRecord[]>({
    queryKey: ["/api/exports", mandantId],
    enabled: !!mandantId,
  });

  const exportMutation = useMutation({
    mutationFn: async ({ executionId, format }: { executionId: string; format: "ascii" | "datev" }) => {
      const response = await apiRequest("POST", `/api/exports`, {
        processExecutionId: executionId,
        format,
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
        window.open(data.downloadUrl as string, "_blank");
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
          Exportieren Sie verarbeitete Daten als ASCII oder DATEV-Format
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-chart-2" />
              Verfügbare Exporte
            </CardTitle>
            <CardDescription>
              Abgeschlossene Prozesse, die exportiert werden können
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : completedExecutions && completedExecutions.length > 0 ? (
              <div className="space-y-3">
                {completedExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="flex items-center justify-between rounded-md border border-border p-4"
                    data-testid={`export-item-${execution.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Prozess-Ausführung</p>
                        <p className="text-sm text-muted-foreground">
                          {execution.month}/{execution.year} • {execution.transactionCount || 0} Transaktionen
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(format) => 
                          exportMutation.mutate({ 
                            executionId: execution.id, 
                            format: format as "ascii" | "datev" 
                          })
                        }
                      >
                        <SelectTrigger className="w-32" data-testid={`select-export-format-${execution.id}`}>
                          <SelectValue placeholder="Export" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ascii">ASCII</SelectItem>
                          <SelectItem value="datev">DATEV</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Keine abgeschlossenen Prozesse</p>
                <p className="text-sm">Führen Sie zuerst Prozesse aus</p>
              </div>
            )}
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
                    <TableHead></TableHead>
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
                      <TableCell>
                        <Button variant="ghost" size="icon" data-testid={`button-download-${record.id}`}>
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
