import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Download, Trash2, FileText, Calendar, Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, FileInput, FileOutput } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProcessExecution, Process } from "@shared/schema";

interface ProcessHistoryPageProps {
  mandantId: string | null;
}

interface ExecutionWithProcess extends ProcessExecution {
  processName?: string;
}

interface Attachment {
  slotId: string;
  slotLabel: string;
  fileName: string;
  storagePath: string;
}

export function ProcessHistoryPage({ mandantId }: ProcessHistoryPageProps) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: executions, isLoading: executionsLoading } = useQuery<ProcessExecution[]>({
    queryKey: ["/api/process-executions", mandantId],
    queryFn: async () => {
      if (!mandantId) return [];
      const res = await fetch(`/api/process-executions?mandantId=${mandantId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const { data: processes } = useQuery<Process[]>({
    queryKey: ["/api/processes", mandantId],
    queryFn: async () => {
      if (!mandantId) return [];
      const res = await fetch(`/api/processes?mandantId=${mandantId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!mandantId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (executionId: string) => {
      await apiRequest("DELETE", `/api/process-executions/${executionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/process-executions", mandantId] });
      toast({
        title: "Ausführung gelöscht",
        description: "Die Prozessausführung wurde erfolgreich gelöscht.",
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

  const executionsWithProcess: ExecutionWithProcess[] = (executions || []).map(exec => ({
    ...exec,
    processName: processes?.find(p => p.id === exec.processId)?.name || "Unbekannter Prozess",
  })).sort((a, b) => {
    const dateA = a.executedAt ? new Date(a.executedAt).getTime() : 0;
    const dateB = b.executedAt ? new Date(b.executedAt).getTime() : 0;
    return dateB - dateA;
  });

  const handleDownloadAttachment = async (executionId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/process-executions/${executionId}/attachments/${encodeURIComponent(fileName)}`);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Download fehlgeschlagen",
        description: "Die Datei konnte nicht heruntergeladen werden.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadResult = async (executionId: string, delimiter: string = 'semicolon') => {
    try {
      const response = await fetch(`/api/process-executions/${executionId}/result?delimiter=${delimiter}`);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${executionId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Download fehlgeschlagen",
        description: "Die Export-Datei konnte nicht heruntergeladen werden.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="h-3 w-3 mr-1" />
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
            <AlertCircle className="h-3 w-3 mr-1" />
            Ausstehend
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMonthName = (month: number) => {
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", 
                    "Juli", "August", "September", "Oktober", "November", "Dezember"];
    return months[month - 1] || "";
  };

  if (!mandantId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Bitte wählen Sie ein Mandat aus.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historie</h1>
          <p className="text-muted-foreground">Übersicht aller durchgeführten Prozesse</p>
        </div>
      </div>

      {executionsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-20 bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : executionsWithProcess.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Noch keine Prozesse ausgeführt.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {executionsWithProcess.map((execution) => {
            const isExpanded = expandedId === execution.id;
            const attachments = (execution.attachments as Attachment[]) || [];
            const hasOutput = execution.status === "completed" && !!execution.outputData;

            return (
              <Card key={execution.id} className="overflow-hidden">
                <div 
                  className="p-4 cursor-pointer hover-elevate flex items-center justify-between gap-4"
                  onClick={() => setExpandedId(isExpanded ? null : execution.id)}
                  data-testid={`history-item-${execution.id}`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{execution.processName}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {getMonthName(execution.month)} {execution.year}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(execution.executedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {getStatusBadge(execution.status)}
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="border-t pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Transaktionen:</span>
                        <span className="ml-2 font-medium">{execution.transactionCount || 0}</span>
                      </div>
                      {execution.totalAmount && (
                        <div>
                          <span className="text-muted-foreground">Gesamtbetrag:</span>
                          <span className="ml-2 font-medium">{execution.totalAmount}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Abgeschlossen:</span>
                        <span className="ml-2 font-medium">{formatDate(execution.completedAt)}</span>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <FileInput className="h-4 w-4" />
                          Originaldateien (Input)
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {attachments.map((attachment, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadAttachment(execution.id, attachment.fileName);
                              }}
                              data-testid={`download-input-${attachment.fileName}`}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              {attachment.slotLabel || attachment.fileName}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasOutput && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <FileOutput className="h-4 w-4" />
                          Export-Datei (Output)
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadResult(execution.id);
                          }}
                          data-testid={`download-output-${execution.id}`}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Export herunterladen (CSV)
                        </Button>
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`delete-execution-${execution.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Ausführung löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Ausführung löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Diese Aktion kann nicht rückgängig gemacht werden. Alle zugehörigen 
                              Dateien (Input und Output) werden ebenfalls gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(execution.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
