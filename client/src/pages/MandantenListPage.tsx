import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Plus, Search, MoreVertical, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Mandant } from "@shared/schema";

interface MandantenListPageProps {
  onSelectMandant: (mandant: Mandant) => void;
}

export function MandantenListPage({ onSelectMandant }: MandantenListPageProps) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    mandantenNummer: 0,
    beraterNummer: 0,
    sachkontenLaenge: 4,
    sachkontenRahmen: 3,
  });

  const { data: mandanten, isLoading } = useQuery<Mandant[]>({
    queryKey: ["/api/mandanten"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/mandanten", formData);
    },
    onSuccess: () => {
      toast({
        title: "Mandat erstellt",
        description: "Das neue Mandat wurde erfolgreich angelegt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
      setShowCreateDialog(false);
      setFormData({
        name: "",
        mandantenNummer: 0,
        beraterNummer: 0,
        sachkontenLaenge: 4,
        sachkontenRahmen: 3,
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Mandat konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/mandanten/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Mandat gelöscht",
        description: "Das Mandat wurde entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mandanten"] });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Mandat konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const filteredMandanten = mandanten?.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.mandantenNummer.toString().includes(searchQuery)
  );

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Alle Mandate</h1>
          <p className="text-muted-foreground">
            Verwalten Sie alle Ihre Mandanten
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-mandant">
              <Plus className="h-4 w-4 mr-2" />
              Neues Mandat
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Neues Mandat anlegen</DialogTitle>
              <DialogDescription>
                Geben Sie die Stammdaten für das neue Mandat ein
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newName">Mandantenname</Label>
                <Input
                  id="newName"
                  placeholder="Firma XYZ GmbH"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-new-mandant-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newMandantenNummer">Mandantennummer</Label>
                  <Input
                    id="newMandantenNummer"
                    type="number"
                    value={formData.mandantenNummer || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, mandantenNummer: parseInt(e.target.value) || 0 }))}
                    data-testid="input-new-mandanten-nummer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newBeraterNummer">Beraternummer</Label>
                  <Input
                    id="newBeraterNummer"
                    type="number"
                    value={formData.beraterNummer || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, beraterNummer: parseInt(e.target.value) || 0 }))}
                    data-testid="input-new-berater-nummer"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newSachkontenLaenge">Sachkontenlänge</Label>
                  <Input
                    id="newSachkontenLaenge"
                    type="number"
                    value={formData.sachkontenLaenge}
                    onChange={(e) => setFormData(prev => ({ ...prev, sachkontenLaenge: parseInt(e.target.value) || 4 }))}
                    data-testid="input-new-sachkonten-laenge"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newSachkontenRahmen">Sachkontenrahmen</Label>
                  <Input
                    id="newSachkontenRahmen"
                    type="number"
                    value={formData.sachkontenRahmen}
                    onChange={(e) => setFormData(prev => ({ ...prev, sachkontenRahmen: parseInt(e.target.value) || 3 }))}
                    data-testid="input-new-sachkonten-rahmen"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!formData.name || !formData.mandantenNummer || createMutation.isPending}
                data-testid="button-confirm-create-mandant"
              >
                Mandat anlegen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <CardTitle>Mandantenliste</CardTitle>
              <CardDescription>
                {mandanten?.length || 0} Mandate insgesamt
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-mandanten"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredMandanten && filteredMandanten.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Mandanten-Nr.</TableHead>
                  <TableHead>Berater-Nr.</TableHead>
                  <TableHead>SK-Länge</TableHead>
                  <TableHead>SK-Rahmen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMandanten.map((mandant) => (
                  <TableRow
                    key={mandant.id}
                    className="cursor-pointer"
                    onClick={() => onSelectMandant(mandant)}
                    data-testid={`row-mandant-${mandant.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{mandant.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{mandant.mandantenNummer}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {mandant.beraterNummer}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {mandant.sachkontenLaenge}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      SKR {mandant.sachkontenRahmen}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`button-mandant-menu-${mandant.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectMandant(mandant);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(mandant.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">
                {searchQuery ? "Keine Ergebnisse" : "Noch keine Mandate"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "Versuchen Sie einen anderen Suchbegriff"
                  : "Erstellen Sie Ihr erstes Mandat"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-mandant">
                  <Plus className="h-4 w-4 mr-2" />
                  Mandat erstellen
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
