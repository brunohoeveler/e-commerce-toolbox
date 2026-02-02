import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Calendar,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  File,
  Download,
  Trash2,
  Paperclip
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProcessExecution, Process } from "@shared/schema";

interface ProcessExecutionsPageProps {
  mandantId: string | null;
}

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export function ProcessExecutionsPage({ mandantId }: ProcessExecutionsPageProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: executions, isLoading: isLoadingExecutions } = useQuery<ProcessExecution[]>({
    queryKey: [`/api/process-executions?mandantId=${mandantId}`],
    enabled: !!mandantId,
  });

  const { data: processes } = useQuery<Process[]>({
    queryKey: [`/api/processes?mandantId=${mandantId}`],
    enabled: !!mandantId,
  });

  const deleteExecutionMutation = useMutation({
    mutationFn: async (executionId: string) => {
      await apiRequest("DELETE", `/api/process-executions/${executionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && (
            key.startsWith('/api/process-executions') ||
            key.startsWith('/api/financial-summary') ||
            key.startsWith('/api/exports')
          );
        }
      });
      toast({
        title: "Ausführung gelöscht",
        description: "Die Prozess-Ausführung wurde erfolgreich gelöscht.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Ausführung konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const handleDownloadAttachment = (executionId: string, fileName: string) => {
    window.open(`/api/process-executions/${executionId}/attachments/${encodeURIComponent(fileName)}`, '_blank');
  };

  const getProcessName = (processId: string) => {
    return processes?.find(p => p.id === processId)?.name || "Unbekannter Prozess";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-chart-2 text-white">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Abgeschlossen
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Fehlgeschlagen
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Ausstehend
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Kein Mandat ausgewählt</h3>
            <p className="text-muted-foreground">
              Bitte wählen Sie ein Mandat aus der Seitenleiste, um die ausgeführten Prozesse anzuzeigen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ausgeführte Prozesse</h1>
          <p className="text-muted-foreground">
            Übersicht aller Prozess-Ausführungen und deren Ergebnisse
          </p>
        </div>
      </div>

      {isLoadingExecutions ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : executions && executions.length > 0 ? (
        <div className="space-y-4">
          {executions.map((execution) => {
            const isExpanded = expandedId === execution.id;
            const inputFiles = execution.inputFiles as { slotId: string; fileName?: string; type?: string; amount?: number }[] || [];
            const attachments = (execution as any).attachments as { slotId: string; fileName: string; storagePath: string }[] || [];
            const outputData = execution.outputData as { columns?: string[]; transactions?: Record<string, any>[] } | null;
            const hasResult = outputData && Array.isArray(outputData.transactions) && outputData.transactions.length > 0;
            
            return (
              <Collapsible
                key={execution.id}
                open={isExpanded}
                onOpenChange={() => setExpandedId(isExpanded ? null : execution.id)}
              >
                <Card className="transition-all" data-testid={`card-execution-${execution.id}`}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span className="font-medium">
                              {MONTHS[(execution.month || 1) - 1]} {execution.year}
                            </span>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">
                              {getProcessName(execution.processId)}
                            </CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(execution.status)}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <CardDescription className="flex items-center gap-4 mt-2">
                        <span>
                          Erstellt: {execution.executedAt ? new Date(execution.executedAt).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit", 
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          }) : "N/A"}
                        </span>
                        {execution.transactionCount !== null && (
                          <span>
                            {execution.transactionCount} Transaktionen
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Transformationsergebnis
                            </h4>
                            {execution.status === "completed" && hasResult ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button 
                                    className="flex items-center justify-between gap-2 text-sm p-2 rounded-md bg-primary/10 w-full hover-elevate cursor-pointer text-left border border-primary/20"
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`button-download-result-${execution.id}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                                      <span className="truncate font-medium">Ergebnis-Datei (CSV)</span>
                                    </div>
                                    <Download className="h-4 w-4 text-primary flex-shrink-0" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem 
                                    onClick={() => window.open(`/api/process-executions/${execution.id}/result?delimiter=semicolon`, '_blank')}
                                    data-testid={`download-semicolon-${execution.id}`}
                                  >
                                    Semikolon-getrennt (;)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => window.open(`/api/process-executions/${execution.id}/result?delimiter=comma`, '_blank')}
                                    data-testid={`download-comma-${execution.id}`}
                                  >
                                    Komma-getrennt (,)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => window.open(`/api/process-executions/${execution.id}/result?delimiter=tab`, '_blank')}
                                    data-testid={`download-tab-${execution.id}`}
                                  >
                                    Tab-getrennt
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <p className="text-sm text-muted-foreground">Kein Ergebnis verfügbar</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                              <Paperclip className="h-4 w-4" />
                              Original-Dateien
                            </h4>
                            {attachments.length > 0 ? (
                              <div className="space-y-1">
                                {attachments.map((file, index) => (
                                  <button 
                                    key={index} 
                                    className="flex items-center justify-between gap-2 text-sm p-2 rounded-md bg-muted/50 w-full hover-elevate cursor-pointer text-left"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadAttachment(execution.id, file.fileName);
                                    }}
                                    data-testid={`button-download-attachment-${index}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      <span className="truncate text-primary underline">{file.fileName}</span>
                                    </div>
                                    <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  </button>
                                ))}
                              </div>
                            ) : inputFiles.length > 0 ? (
                              <div className="space-y-1">
                                {inputFiles.map((file, index) => {
                                  const hasAttachment = attachments.some(a => a.fileName === file.fileName);
                                  return (
                                    <button 
                                      key={index} 
                                      className={`flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50 w-full text-left ${hasAttachment ? 'hover-elevate cursor-pointer' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (file.fileName) {
                                          handleDownloadAttachment(execution.id, file.fileName);
                                        }
                                      }}
                                      disabled={!file.fileName}
                                      data-testid={`button-download-inputfile-${index}`}
                                    >
                                      <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      {file.fileName ? (
                                        <>
                                          <span className="truncate text-primary underline">{file.fileName}</span>
                                          <Download className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-auto" />
                                        </>
                                      ) : file.type === 'manual' ? (
                                        <span className="truncate">
                                          Manuelle Eingabe: {typeof file.amount === 'number' ? file.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) : file.amount}
                                        </span>
                                      ) : (
                                        <span className="truncate text-muted-foreground">Keine Datei</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Keine Dateien</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-medium text-sm text-muted-foreground">Details</h4>
                          <Table>
                            <TableBody>
                              <TableRow>
                                <TableCell className="text-muted-foreground py-2">Status</TableCell>
                                <TableCell className="py-2">{getStatusBadge(execution.status)}</TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="text-muted-foreground py-2">Zeitraum</TableCell>
                                <TableCell className="py-2">
                                  {MONTHS[(execution.month || 1) - 1]} {execution.year}
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell className="text-muted-foreground py-2">Transaktionen</TableCell>
                                <TableCell className="py-2">
                                  {execution.transactionCount ?? "N/A"}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button variant="outline" asChild data-testid={`button-open-process-${execution.id}`}>
                          <Link href={`/processes/${execution.processId}/execute`}>
                            <FileText className="h-4 w-4 mr-2" />
                            Prozess öffnen
                          </Link>
                        </Button>
                        {execution.status === "completed" && (
                          <Button variant="outline" asChild data-testid={`button-exports-${execution.id}`}>
                            <Link href="/exports">
                              <Download className="h-4 w-4 mr-2" />
                              Zu Exporten
                            </Link>
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="destructive" 
                              data-testid={`button-delete-execution-${execution.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Löschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ausführung löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Möchten Sie diese Prozess-Ausführung wirklich löschen? 
                                Diese Aktion kann nicht rückgängig gemacht werden. 
                                Alle zugehörigen Exporte werden ebenfalls gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteExecutionMutation.mutate(execution.id)}
                                data-testid={`button-confirm-delete-${execution.id}`}
                              >
                                {deleteExecutionMutation.isPending ? "Wird gelöscht..." : "Löschen"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Noch keine Ausführungen</h3>
            <p className="text-muted-foreground mb-4">
              Es wurden noch keine Prozesse für dieses Mandat ausgeführt.
            </p>
            <Button asChild data-testid="button-go-to-processes">
              <Link href="/processes">
                <FileText className="h-4 w-4 mr-2" />
                Zu den Prozessen
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
