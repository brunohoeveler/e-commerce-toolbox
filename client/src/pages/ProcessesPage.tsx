import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Play, Settings, FileText, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Process, ProcessExecution } from "@shared/schema";

interface ProcessesPageProps {
  mandantId: string | null;
}

export function ProcessesPage({ mandantId }: ProcessesPageProps) {
  const { data: processes, isLoading } = useQuery<Process[]>({
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

  const { data: recentExecutions } = useQuery<ProcessExecution[]>({
    queryKey: ["/api/process-executions/recent", mandantId],
    queryFn: async () => {
      const res = await fetch(`/api/process-executions/recent?mandantId=${mandantId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch executions");
      return res.json();
    },
    enabled: !!mandantId,
  });

  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Kein Mandat ausgewählt</h3>
            <p className="text-muted-foreground">
              Bitte wählen Sie ein Mandat aus der Seitenleiste, um die Prozesse anzuzeigen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getExecutionStatus = (processId: string) => {
    const execution = recentExecutions?.find(e => e.processId === processId);
    return execution?.status || null;
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Prozesse</h1>
          <p className="text-muted-foreground">
            Verwalten und führen Sie Ihre Datentransformationsprozesse aus
          </p>
        </div>
        <Button asChild data-testid="button-new-process">
          <Link href="/processes/new">
            <Plus className="h-4 w-4 mr-2" />
            Neuer Prozess
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : processes && processes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {processes.map((process) => {
            const status = getExecutionStatus(process.id);
            return (
              <Card key={process.id} className="hover-elevate transition-all" data-testid={`card-process-${process.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{process.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {process.description || `${process.inputFileCount} Input-Datei(en)`}
                      </CardDescription>
                    </div>
                    {status && (
                      <Badge
                        variant={
                          status === "completed" ? "default" :
                          status === "failed" ? "destructive" : "secondary"
                        }
                      >
                        {status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                        {status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                        {status === "completed" ? "Erledigt" :
                         status === "failed" ? "Fehler" : "Ausstehend"}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      asChild
                      data-testid={`button-execute-process-${process.id}`}
                    >
                      <Link href={`/processes/${process.id}/execute`}>
                        <Play className="h-4 w-4 mr-2" />
                        Ausführen
                      </Link>
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <Link href={`/processes/${process.id}/edit`} data-testid={`button-edit-process-${process.id}`}>
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Noch keine Prozesse</h3>
            <p className="text-muted-foreground mb-4">
              Erstellen Sie Ihren ersten Datentransformationsprozess
            </p>
            <Button asChild data-testid="button-create-first-process">
              <Link href="/processes/new">
                <Plus className="h-4 w-4 mr-2" />
                Prozess erstellen
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
