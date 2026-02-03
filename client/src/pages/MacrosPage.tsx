import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Save, Trash2, Code, Loader2, Upload, File, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { Macro, PatternFile } from "@shared/schema";

export function MacrosPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pythonCode, setPythonCode] = useState(`# Macro Funktion
# Diese Funktion kann in Prozessen importiert werden:
# from macros import macro_name

def process_data(df):
    """
    Verarbeitet einen DataFrame.
    
    Args:
        df: Polars oder Pandas DataFrame
    
    Returns:
        Verarbeiteter DataFrame
    """
    return df
`);
  const [patternFiles, setPatternFiles] = useState<PatternFile[]>([]);
  const [newPatternName, setNewPatternName] = useState("");
  const [newPatternVariable, setNewPatternVariable] = useState("");
  const [uploadingPattern, setUploadingPattern] = useState(false);
  const patternFileInputRef = useRef<HTMLInputElement>(null);

  const { data: macros, isLoading } = useQuery<Macro[]>({
    queryKey: ["/api/macros"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; pythonCode: string }) => {
      if (editingMacro) {
        return apiRequest("PATCH", `/api/macros/${editingMacro.id}`, data);
      } else {
        return apiRequest("POST", "/api/macros", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });
      toast({
        title: editingMacro ? "Macro aktualisiert" : "Macro erstellt",
        description: `Das Macro "${name}" wurde erfolgreich gespeichert.`,
      });
      resetForm();
      setDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Macro konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/macros/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });
      toast({
        title: "Macro gelöscht",
        description: "Das Macro wurde erfolgreich entfernt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Macro konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setPythonCode(`# Macro Funktion
# Diese Funktion kann in Prozessen importiert werden:
# from macros import macro_name

def process_data(df):
    """
    Verarbeitet einen DataFrame.
    
    Args:
        df: Polars oder Pandas DataFrame
    
    Returns:
        Verarbeiteter DataFrame
    """
    return df
`);
    setPatternFiles([]);
    setNewPatternName("");
    setNewPatternVariable("");
    setEditingMacro(null);
  };

  const handleEdit = (macro: Macro) => {
    setEditingMacro(macro);
    setName(macro.name);
    setDescription(macro.description || "");
    setPythonCode(macro.pythonCode);
    setPatternFiles((macro.patternFiles as PatternFile[]) || []);
    setDialogOpen(true);
  };

  const handlePatternFileUpload = async (file: File) => {
    if (!editingMacro) {
      toast({
        title: "Hinweis",
        description: "Bitte speichern Sie zuerst das Macro, bevor Sie Pattern-Dateien hochladen.",
        variant: "destructive",
      });
      return;
    }

    if (!newPatternVariable.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Variablennamen für die Pattern-Datei ein.",
        variant: "destructive",
      });
      return;
    }

    setUploadingPattern(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('variable', newPatternVariable);
      formData.append('name', newPatternName || file.name);

      const response = await fetch(`/api/macros/${editingMacro.id}/pattern-files`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const newPatternFile = await response.json();
      setPatternFiles([...patternFiles, newPatternFile]);
      setNewPatternName("");
      setNewPatternVariable("");
      
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });

      toast({
        title: "Pattern-Datei hochgeladen",
        description: `Die Datei "${file.name}" wurde als Variable "${newPatternVariable}" gespeichert.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Die Pattern-Datei konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    } finally {
      setUploadingPattern(false);
    }
  };

  const handleDeletePatternFile = async (fileId: string) => {
    if (!editingMacro) return;

    try {
      await apiRequest("DELETE", `/api/macros/${editingMacro.id}/pattern-files/${fileId}`);
      setPatternFiles(patternFiles.filter(f => f.id !== fileId));
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });

      toast({
        title: "Pattern-Datei entfernt",
        description: "Die Datei wurde erfolgreich entfernt.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Die Pattern-Datei konnte nicht entfernt werden.",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für das Macro ein.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({ name, description, pythonCode });
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Macros</h1>
          <p className="text-muted-foreground">
            Wiederverwendbare Python-Funktionen für Prozesse (nur für Admins)
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-macro">
              <Plus className="h-4 w-4 mr-2" />
              Neues Macro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingMacro ? "Macro bearbeiten" : "Neues Macro erstellen"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="macro-name">Name</Label>
                  <Input
                    id="macro-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z.B. format_currency"
                    data-testid="input-macro-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="macro-description">Beschreibung (optional)</Label>
                  <Input
                    id="macro-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Kurze Beschreibung..."
                    data-testid="input-macro-description"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Python Code</Label>
                <Textarea
                  value={pythonCode}
                  onChange={(e) => setPythonCode(e.target.value)}
                  className="font-mono text-sm min-h-[300px] resize-none"
                  data-testid="textarea-macro-code"
                />
              </div>
              
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Pattern-Dateien</Label>
                    <p className="text-sm text-muted-foreground">
                      Statische Dateien, die automatisch als Variablen verfügbar sind
                    </p>
                  </div>
                </div>

                {patternFiles.length > 0 && (
                  <div className="space-y-2">
                    {patternFiles.map((pf) => (
                      <div key={pf.id} className="flex items-center justify-between gap-2 p-3 border rounded-md bg-muted/50">
                        <div className="flex items-center gap-3">
                          <File className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{pf.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Variable: <code className="bg-muted px-1 rounded">{pf.variable}</code>
                            </p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeletePatternFile(pf.id)}
                          data-testid={`button-delete-pattern-${pf.id}`}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {editingMacro && (
                  <div className="space-y-3 p-3 border rounded-md bg-background">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pattern-name">Name (optional)</Label>
                        <Input
                          id="pattern-name"
                          value={newPatternName}
                          onChange={(e) => setNewPatternName(e.target.value)}
                          placeholder="z.B. Ländercodes"
                          data-testid="input-pattern-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pattern-variable">Variable *</Label>
                        <Input
                          id="pattern-variable"
                          value={newPatternVariable}
                          onChange={(e) => setNewPatternVariable(e.target.value)}
                          placeholder="z.B. country_codes"
                          data-testid="input-pattern-variable"
                        />
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={patternFileInputRef}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handlePatternFileUpload(file);
                          e.target.value = '';
                        }
                      }}
                      accept=".csv,.xlsx,.xls,.txt,.json"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => patternFileInputRef.current?.click()}
                      disabled={uploadingPattern || !newPatternVariable.trim()}
                      data-testid="button-upload-pattern"
                    >
                      {uploadingPattern ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Datei hochladen
                    </Button>
                  </div>
                )}

                {!editingMacro && (
                  <p className="text-sm text-muted-foreground italic">
                    Speichern Sie zuerst das Macro, um Pattern-Dateien hochladen zu können.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-macro">
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Speichern..." : "Speichern"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : macros && macros.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {macros.map((macro) => (
            <Card key={macro.id} className="hover-elevate">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{macro.name}</CardTitle>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-macro-${macro.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Macro löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Sind Sie sicher, dass Sie das Macro "{macro.name}" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(macro.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent>
                {macro.description && (
                  <p className="text-sm text-muted-foreground mb-3">{macro.description}</p>
                )}
                <pre className="text-xs bg-muted p-2 rounded-md overflow-hidden text-ellipsis max-h-20">
                  {macro.pythonCode.slice(0, 150)}...
                </pre>
                {((macro.patternFiles as PatternFile[]) || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {((macro.patternFiles as PatternFile[]) || []).map((pf) => (
                      <Badge key={pf.id} variant="secondary" className="text-xs">
                        <File className="h-3 w-3 mr-1" />
                        {pf.variable}
                      </Badge>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => handleEdit(macro)}
                  data-testid={`button-edit-macro-${macro.id}`}
                >
                  Bearbeiten
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Code className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Keine Macros vorhanden</h3>
            <p className="text-muted-foreground mb-4">
              Erstellen Sie wiederverwendbare Python-Funktionen für Ihre Prozesse.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
