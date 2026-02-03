import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, FileCode, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Process } from "@shared/schema";

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

  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prozesse</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre Datentransformationsprozesse
          </p>
        </div>
        <Link href="/processes/new">
          <Button data-testid="button-new-process">
            <Plus className="h-4 w-4 mr-2" />
            Neuen Prozess anlegen
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : processes && processes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {processes.map((process) => (
            <Link key={process.id} href={`/processes/${process.id}/execute`}>
              <Card className="cursor-pointer hover-elevate transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/10">
                      <FileCode className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate" data-testid={`text-process-name-${process.id}`}>
                        {process.name}
                      </h3>
                      {process.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {process.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {process.inputFileCount} Input-Datei{process.inputFileCount !== 1 ? "en" : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Keine Prozesse vorhanden</h3>
            <p className="text-muted-foreground mb-4">
              Erstellen Sie Ihren ersten Prozess, um Daten zu transformieren.
            </p>
            <Link href="/processes/new">
              <Button data-testid="button-create-first-process">
                <Plus className="h-4 w-4 mr-2" />
                Ersten Prozess erstellen
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
