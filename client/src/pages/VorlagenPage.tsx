import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Save, Trash2, Code, Loader2, Upload, File, X, Download, FileText, Code2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

function highlightPython(code: string): string {
  const tokens: Array<{type: string, value: string}> = [];
  let remaining = code;
  
  const patterns: Array<{type: string, regex: RegExp}> = [
    { type: 'comment', regex: /^#.*/ },
    { type: 'string', regex: /^"""[\s\S]*?"""/ },
    { type: 'string', regex: /^'''[\s\S]*?'''/ },
    { type: 'string', regex: /^"(?:[^"\\]|\\.)*"/ },
    { type: 'string', regex: /^'(?:[^'\\]|\\.)*'/ },
    { type: 'keyword', regex: /^(import|from|as|def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|try|except|finally|raise|with|lambda|pass|break|continue|yield|global|nonlocal|assert|del)\b/ },
    { type: 'library', regex: /^(pl|pd|polars|pandas|numpy|np|openpyxl|xlsxwriter)\b/ },
    { type: 'function', regex: /^(read_csv|read_excel|to_csv|to_excel|filter|select|with_columns|join|group_by|agg|sort|head|tail|drop|rename|alias|cast|when|then|otherwise|col|lit|concat_str|contains|replace|split|is_null|is_not_null|fill_null|unique|count|sum|mean|min|max|len|apply|map|merge|concat|DataFrame|Series|coalesce|zip|dict|enumerate|slice|str|abs|round)\b/ },
    { type: 'number', regex: /^\d+\.?\d*/ },
    { type: 'identifier', regex: /^[a-zA-Z_]\w*/ },
    { type: 'whitespace', regex: /^\s+/ },
    { type: 'operator', regex: /^[+\-*/%=<>!&|^~]+/ },
    { type: 'punctuation', regex: /^[[\](){}:,.]/ },
    { type: 'other', regex: /^./ },
  ];
  
  while (remaining.length > 0) {
    let matched = false;
    for (const {type, regex} of patterns) {
      const match = remaining.match(regex);
      if (match) {
        tokens.push({type, value: match[0]});
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({type: 'other', value: remaining[0]});
      remaining = remaining.slice(1);
    }
  }
  
  return tokens.map(({type, value}) => {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    switch(type) {
      case 'comment': return `<span style="color:#6a9955;font-style:italic">${escaped}</span>`;
      case 'string': return `<span style="color:#ce9178">${escaped}</span>`;
      case 'keyword': return `<span style="color:#c586c0">${escaped}</span>`;
      case 'library': return `<span style="color:#4ec9b0">${escaped}</span>`;
      case 'function': return `<span style="color:#dcdcaa">${escaped}</span>`;
      case 'number': return `<span style="color:#b5cea8">${escaped}</span>`;
      default: return escaped;
    }
  }).join('');
}
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
                    <div className="rounded-md overflow-hidden border border-[#3c3c3c]">
                      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#3c3c3c]">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Code2 className="h-4 w-4 text-[#569cd6]" />
                            <span className="text-sm font-medium text-[#cccccc]">Python Code</span>
                          </div>
                          <Badge variant="outline" className="bg-[#1e1e1e] text-[#6a9955] border-[#3c3c3c] text-xs">
                            .py
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#808080]">
                          <span>polars</span>
                          <span>•</span>
                          <span>pandas</span>
                        </div>
                      </div>
                      
                      <div className="flex bg-[#1e1e1e]" style={{ height: '300px' }}>
                        <div 
                          className="select-none py-4 pr-4 pl-4 text-right text-[#858585] font-mono text-sm leading-6 bg-[#1e1e1e] border-r border-[#3c3c3c] min-w-[50px] overflow-hidden"
                          style={{ height: '300px' }}
                        >
                          {pythonCode.split('\n').map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        
                        <div 
                          className="relative flex-1 overflow-auto"
                          style={{ height: '300px' }}
                        >
                          <div className="relative min-h-full">
                            <pre 
                              className="font-mono text-sm leading-6 p-4 whitespace-pre text-[#d4d4d4]"
                              style={{ tabSize: 4, margin: 0 }}
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{ __html: highlightPython(pythonCode) + '\n' }}
                            />
                            
                            <textarea
                              value={pythonCode}
                              onChange={(e) => setPythonCode(e.target.value)}
                              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white font-mono text-sm leading-6 p-4 resize-none outline-none whitespace-pre"
                              placeholder="# Ihr Python-Code hier..."
                              spellCheck={false}
                              data-testid="textarea-macro-code"
                              style={{ tabSize: 4 }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between px-4 py-1 bg-[#007acc] text-white text-xs">
                        <div className="flex items-center gap-4">
                          <span>Python</span>
                          <span>UTF-8</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span>Zeilen: {pythonCode.split('\n').length}</span>
                          <span>Spaces: 4</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t">
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
