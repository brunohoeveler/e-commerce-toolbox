import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, FileCode, Loader2, Pencil, Trash2, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Process } from "@shared/schema";

interface ProcessesPageProps {
  mandantId: string | null;
}

export function ProcessesPage({ mandantId }: ProcessesPageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [processToDelete, setProcessToDelete] = useState<Process | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: async (processId: string) => {
      return apiRequest("DELETE", `/api/processes/${processId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processes", mandantId] });
      toast({
        title: "Prozess gelöscht",
        description: `Der Prozess "${processToDelete?.name}" wurde erfolgreich gelöscht.`,
      });
      setDeleteDialogOpen(false);
      setProcessToDelete(null);
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Prozess konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (e: React.MouseEvent, process: Process) => {
    e.preventDefault();
    e.stopPropagation();
    setProcessToDelete(process);
    setDeleteDialogOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, processId: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/processes/${processId}/edit`);
  };

  const handleExecuteClick = (e: React.MouseEvent, processId: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/processes/${processId}/execute`);
  };

  const confirmDelete = () => {
    if (processToDelete) {
      deleteMutation.mutate(processToDelete.id);
    }
  };

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
            <Card key={process.id} className="hover-elevate transition-all">
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
                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  <Button
                    size="sm"
                    onClick={(e) => handleExecuteClick(e, process.id)}
                    data-testid={`button-execute-process-${process.id}`}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Ausführen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleEditClick(e, process.id)}
                    data-testid={`button-edit-process-${process.id}`}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Bearbeiten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDeleteClick(e, process)}
                    data-testid={`button-delete-process-${process.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prozess löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Prozess "{processToDelete?.name}" wirklich löschen? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Löschen..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
