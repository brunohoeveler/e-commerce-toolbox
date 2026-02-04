import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Save, Trash2, Code, Loader2, Upload, File, X, Download, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { Macro, PatternFile, TemplateFile } from "@shared/schema";

export function VorlagenPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("macros");

  // Macro state
  const [macroDialogOpen, setMacroDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [macroName, setMacroName] = useState("");
  const [macroDescription, setMacroDescription] = useState("");
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

  // Template file state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);

  // Queries
  const { data: macros, isLoading: macrosLoading } = useQuery<Macro[]>({
    queryKey: ["/api/macros"],
  });

  const { data: templateFiles, isLoading: templatesLoading } = useQuery<TemplateFile[]>({
    queryKey: ["/api/template-files"],
  });

  // Macro mutations
  const saveMacroMutation = useMutation({
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
        title: editingMacro ? "Makro aktualisiert" : "Makro erstellt",
        description: `Das Makro "${macroName}" wurde erfolgreich gespeichert.`,
      });
      resetMacroForm();
      setMacroDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Makro konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const deleteMacroMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/macros/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/macros"] });
      toast({
        title: "Makro gelöscht",
        description: "Das Makro wurde erfolgreich entfernt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Makro konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  // Template file mutations
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/template-files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/template-files"] });
      toast({
        title: "Vorlagedatei gelöscht",
        description: "Die Datei wurde erfolgreich entfernt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Vorlagedatei konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const resetMacroForm = () => {
    setMacroName("");
    setMacroDescription("");
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

  const resetTemplateForm = () => {
    setTemplateName("");
    setTemplateDescription("");
    setSelectedTemplateFile(null);
  };

  const handleEditMacro = (macro: Macro) => {
    setEditingMacro(macro);
    setMacroName(macro.name);
    setMacroDescription(macro.description || "");
    setPythonCode(macro.pythonCode);
    setPatternFiles((macro.patternFiles as PatternFile[]) || []);
    setMacroDialogOpen(true);
  };

  const handlePatternFileUpload = async (file: File) => {
    if (!editingMacro) {
      toast({
        title: "Hinweis",
        description: "Bitte speichern Sie zuerst das Makro, bevor Sie Pattern-Dateien hochladen.",
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

  const handleSaveMacro = () => {
    if (!macroName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für das Makro ein.",
        variant: "destructive",
      });
      return;
    }

    saveMacroMutation.mutate({ name: macroName, description: macroDescription, pythonCode });
  };

  const handleUploadTemplate = async () => {
    if (!selectedTemplateFile) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie eine Datei aus.",
        variant: "destructive",
      });
      return;
    }

    if (!templateName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für die Vorlage ein.",
        variant: "destructive",
      });
      return;
    }

    setUploadingTemplate(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedTemplateFile);
      formData.append('name', templateName);
      formData.append('description', templateDescription);

      const response = await fetch('/api/template-files', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      queryClient.invalidateQueries({ queryKey: ["/api/template-files"] });
      toast({
        title: "Vorlagedatei hochgeladen",
        description: `Die Datei "${templateName}" wurde erfolgreich gespeichert.`,
      });
      resetTemplateForm();
      setTemplateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Die Vorlagedatei konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleDownloadTemplate = async (file: TemplateFile) => {
    try {
      const response = await fetch(`/api/template-files/${file.id}/download`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalFilename;
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

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vorlagen</h1>
        <p className="text-muted-foreground">
          Wiederverwendbare Makros und Vorlagedateien für Prozesse
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="macros" data-testid="tab-macros">
            <Code className="h-4 w-4 mr-2" />
            Makros
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="h-4 w-4 mr-2" />
            Vorlagedateien
          </TabsTrigger>
        </TabsList>

        <TabsContent value="macros" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={macroDialogOpen} onOpenChange={(open) => {
              setMacroDialogOpen(open);
              if (!open) resetMacroForm();
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-macro">
                  <Plus className="h-4 w-4 mr-2" />
                  Neues Makro
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingMacro ? "Makro bearbeiten" : "Neues Makro erstellen"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="macro-name">Name</Label>
                      <Input
                        id="macro-name"
                        value={macroName}
                        onChange={(e) => setMacroName(e.target.value)}
                        placeholder="z.B. format_currency"
                        data-testid="input-macro-name"
                      />
                      <p className="text-xs text-muted-foreground">
                        Import: <code className="bg-muted px-1 rounded">from macros import {macroName || 'name'}</code>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="macro-description">Beschreibung (optional)</Label>
                      <Input
                        id="macro-description"
                        value={macroDescription}
                        onChange={(e) => setMacroDescription(e.target.value)}
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
                        Speichern Sie zuerst das Makro, um Pattern-Dateien hochladen zu können.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setMacroDialogOpen(false)}>
                      Abbrechen
                    </Button>
                    <Button onClick={handleSaveMacro} disabled={saveMacroMutation.isPending} data-testid="button-save-macro">
                      <Save className="h-4 w-4 mr-2" />
                      {saveMacroMutation.isPending ? "Speichern..." : "Speichern"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {macrosLoading ? (
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
                            <AlertDialogTitle>Makro löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sind Sie sicher, dass Sie das Makro "{macro.name}" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMacroMutation.mutate(macro.id)}
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
                    <p className="text-xs text-muted-foreground mb-2">
                      <code className="bg-muted px-1 rounded">from macros import {macro.name}</code>
                    </p>
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
                      onClick={() => handleEditMacro(macro)}
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
                <h3 className="font-semibold text-lg mb-2">Keine Makros vorhanden</h3>
                <p className="text-muted-foreground mb-4">
                  Erstellen Sie wiederverwendbare Python-Funktionen für Ihre Prozesse.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={templateDialogOpen} onOpenChange={(open) => {
              setTemplateDialogOpen(open);
              if (!open) resetTemplateForm();
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-template">
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Vorlagedatei
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neue Vorlagedatei hochladen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Name *</Label>
                    <Input
                      id="template-name"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="z.B. laendercodes.csv"
                      data-testid="input-template-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Verwendung im Code: <code className="bg-muted px-1 rounded">pl.read_csv("vorlagen/{templateName || 'name'}")</code>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-description">Beschreibung (optional)</Label>
                    <Input
                      id="template-description"
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      placeholder="Kurze Beschreibung..."
                      data-testid="input-template-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Datei *</Label>
                    <input
                      type="file"
                      ref={templateFileInputRef}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedTemplateFile(file);
                          if (!templateName) {
                            setTemplateName(file.name);
                          }
                        }
                      }}
                      accept=".csv,.xlsx,.xls,.txt,.json"
                    />
                    {selectedTemplateFile ? (
                      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                        <File className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">{selectedTemplateFile.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelectedTemplateFile(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => templateFileInputRef.current?.click()}
                        data-testid="button-select-template-file"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Datei auswählen
                      </Button>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                      Abbrechen
                    </Button>
                    <Button 
                      onClick={handleUploadTemplate} 
                      disabled={uploadingTemplate || !selectedTemplateFile || !templateName.trim()}
                      data-testid="button-upload-template"
                    >
                      {uploadingTemplate ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {uploadingTemplate ? "Hochladen..." : "Hochladen"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templateFiles && templateFiles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templateFiles.map((file) => (
                <Card key={file.id} className="hover-elevate">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">{file.name}</CardTitle>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-delete-template-${file.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Vorlagedatei löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sind Sie sicher, dass Sie die Datei "{file.name}" löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteTemplateMutation.mutate(file.id)}
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
                    {file.description && (
                      <p className="text-sm text-muted-foreground mb-3">{file.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mb-2">
                      Original: {file.originalFilename}
                    </p>
                    <p className="text-xs mb-3">
                      <code className="bg-muted px-1 rounded">pl.read_csv("vorlagen/{file.name}")</code>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleDownloadTemplate(file)}
                      data-testid={`button-download-template-${file.id}`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Herunterladen
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">Keine Vorlagedateien vorhanden</h3>
                <p className="text-muted-foreground mb-4">
                  Laden Sie Vorlagedateien hoch, die in Prozessen verwendet werden können.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
