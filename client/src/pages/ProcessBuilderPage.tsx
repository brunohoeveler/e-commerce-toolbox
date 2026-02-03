import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save, Plus, Trash2, ArrowLeft, FileCode, Puzzle, Code2 } from "lucide-react";

// Python syntax highlighting function
function highlightPython(code: string): string {
  // Escape HTML
  let highlighted = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Comments (must be first to avoid conflicts)
  highlighted = highlighted.replace(/(#.*?)$/gm, '<span class="py-comment">$1</span>');
  
  // Triple-quoted strings
  highlighted = highlighted.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span class="py-string">$1</span>');
  
  // Double-quoted strings
  highlighted = highlighted.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="py-string">$1</span>');
  
  // Single-quoted strings  
  highlighted = highlighted.replace(/('(?:[^'\\]|\\.)*')/g, '<span class="py-string">$1</span>');
  
  // Numbers
  highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g, '<span class="py-number">$1</span>');
  
  // Python keywords
  const keywords = ['import', 'from', 'as', 'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'pass', 'break', 'continue', 'yield', 'global', 'nonlocal', 'assert', 'del'];
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'g');
    highlighted = highlighted.replace(regex, '<span class="py-keyword">$1</span>');
  });
  
  // Libraries/modules (polars, pandas, etc.)
  const libraries = ['pl', 'pd', 'polars', 'pandas', 'numpy', 'np', 'openpyxl', 'xlsxwriter', 'io', 'os', 're', 'json', 'csv', 'datetime'];
  libraries.forEach(lib => {
    const regex = new RegExp(`\\b(${lib})\\b`, 'g');
    highlighted = highlighted.replace(regex, '<span class="py-library">$1</span>');
  });
  
  // Common polars/pandas methods
  const methods = ['read_csv', 'read_excel', 'to_csv', 'to_excel', 'filter', 'select', 'with_columns', 'join', 'group_by', 'agg', 'sort', 'head', 'tail', 'drop', 'rename', 'alias', 'cast', 'when', 'then', 'otherwise', 'col', 'lit', 'concat_str', 'str', 'contains', 'replace', 'split', 'is_null', 'is_not_null', 'fill_null', 'unique', 'count', 'sum', 'mean', 'min', 'max', 'len', 'apply', 'map', 'merge', 'concat', 'DataFrame', 'Series', 'coalesce'];
  methods.forEach(method => {
    const regex = new RegExp(`\\b(${method})\\b`, 'g');
    highlighted = highlighted.replace(regex, '<span class="py-function">$1</span>');
  });
  
  // Function definitions
  highlighted = highlighted.replace(/\b(def)\s+(\w+)/g, '<span class="py-keyword">$1</span> <span class="py-funcdef">$2</span>');
  
  // Variable assignments (basic pattern)
  highlighted = highlighted.replace(/^(\s*)(\w+)(\s*=)/gm, '$1<span class="py-variable">$2</span>$3');
  
  return highlighted;
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { InputFileSlot, OutputFile, Process, Macro } from "@shared/schema";

interface ProcessBuilderPageProps {
  mandantId: string | null;
  processId?: string;
}

export function ProcessBuilderPage({ mandantId, processId }: ProcessBuilderPageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inputFileSlots, setInputFileSlots] = useState<InputFileSlot[]>([]);
  const [pythonCode, setPythonCode] = useState(`# Verfügbare DataFrames basierend auf Input-Dateien:
# data1, data2, etc. (je nach Anzahl der Input-Dateien)
#
# Verfügbare Bibliotheken:
# import polars as pl
# import pandas as pd
# import openpyxl
# import xlsxwriter
#
# Beispiel:
# result = data1.filter(pl.col("amount") > 0)

`);
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [usedMacroIds, setUsedMacroIds] = useState<string[]>([]);

  // Fetch available macros
  const { data: macros } = useQuery<Macro[]>({
    queryKey: ["/api/macros"],
  });

  const { data: existingProcess, isLoading: processLoading } = useQuery<Process>({
    queryKey: ["/api/processes", processId],
    queryFn: async () => {
      const res = await fetch(`/api/processes/${processId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch process");
      return res.json();
    },
    enabled: !!processId,
  });

  useEffect(() => {
    if (existingProcess) {
      setName(existingProcess.name);
      setDescription(existingProcess.description || "");
      setInputFileSlots(existingProcess.inputFileSlots as InputFileSlot[] || []);
      setPythonCode(existingProcess.pythonCode || "");
      setOutputFiles(existingProcess.outputFiles as OutputFile[] || []);
      setUsedMacroIds((existingProcess as any).usedMacroIds || []);
    }
  }, [existingProcess]);

  const saveMutation = useMutation({
    mutationFn: async (data: {
      mandantId: string;
      name: string;
      description: string;
      inputFileCount: number;
      inputFileSlots: InputFileSlot[];
      pythonCode: string;
      outputFiles: OutputFile[];
      usedMacroIds: string[];
    }) => {
      if (processId) {
        return apiRequest("PATCH", `/api/processes/${processId}`, data);
      } else {
        return apiRequest("POST", "/api/processes", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processes"] });
      toast({
        title: processId ? "Prozess aktualisiert" : "Prozess erstellt",
        description: `Der Prozess "${name}" wurde erfolgreich gespeichert.`,
      });
      navigate("/processes");
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Der Prozess konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const addInputFileSlot = () => {
    const newIndex = inputFileSlots.length + 1;
    setInputFileSlots([
      ...inputFileSlots,
      {
        id: crypto.randomUUID(),
        variable: `data${newIndex}`,
        label: `Datei ${newIndex}`,
        description: "",
        required: true,
      },
    ]);
  };

  const removeInputFileSlot = (id: string) => {
    setInputFileSlots(inputFileSlots.filter((slot) => slot.id !== id));
  };

  const updateInputFileSlot = (id: string, updates: Partial<InputFileSlot>) => {
    setInputFileSlots(
      inputFileSlots.map((slot) =>
        slot.id === id ? { ...slot, ...updates } : slot
      )
    );
  };

  const addOutputFile = () => {
    setOutputFiles([
      ...outputFiles,
      {
        id: crypto.randomUUID(),
        name: `export_${outputFiles.length + 1}`,
        dataFrameVariable: "result",
        format: "csv",
      },
    ]);
  };

  const removeOutputFile = (id: string) => {
    setOutputFiles(outputFiles.filter((file) => file.id !== id));
  };

  const updateOutputFile = (id: string, updates: Partial<OutputFile>) => {
    setOutputFiles(
      outputFiles.map((file) =>
        file.id === id ? { ...file, ...updates } : file
      )
    );
  };

  const handleSave = () => {
    if (!mandantId) {
      toast({
        title: "Fehler",
        description: "Kein Mandat ausgewählt.",
        variant: "destructive",
      });
      return;
    }

    if (!name.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für den Prozess ein.",
        variant: "destructive",
      });
      return;
    }

    if (inputFileSlots.length === 0) {
      toast({
        title: "Fehler",
        description: "Bitte fügen Sie mindestens eine Input-Datei hinzu.",
        variant: "destructive",
      });
      return;
    }

    if (outputFiles.length === 0) {
      toast({
        title: "Fehler",
        description: "Bitte definieren Sie mindestens eine Export-Datei.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      mandantId,
      name,
      description,
      inputFileCount: inputFileSlots.length,
      inputFileSlots,
      pythonCode,
      outputFiles,
      usedMacroIds,
    });
  };

  // Function to insert a macro's code into the editor
  const insertMacro = (macro: Macro) => {
    if (!usedMacroIds.includes(macro.id)) {
      setUsedMacroIds([...usedMacroIds, macro.id]);
    }
    setPythonCode(prev => {
      const macroComment = `\n# Macro: ${macro.name}\n${macro.pythonCode}\n`;
      return prev + macroComment;
    });
    toast({
      title: "Macro eingefügt",
      description: `"${macro.name}" wurde zum Code hinzugefügt.`,
    });
  };

  // Function to remove a macro from the used list
  const removeMacro = (macroId: string) => {
    setUsedMacroIds(usedMacroIds.filter(id => id !== macroId));
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

  if (processId && processLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/processes")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {processId ? "Prozess bearbeiten" : "Neuer Prozess"}
          </h1>
          <p className="text-muted-foreground">
            Definieren Sie Input-Dateien, Transformationslogik und Export-Dateien
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-process">
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Speichern..." : "Speichern"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Grundinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. PayPal Transaktionen"
                  data-testid="input-process-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kurze Beschreibung des Prozesses..."
                  rows={3}
                  data-testid="input-process-description"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Input-Dateien</CardTitle>
              <Button size="sm" variant="outline" onClick={addInputFileSlot} data-testid="button-add-input-file">
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {inputFileSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine Input-Dateien definiert. Klicken Sie auf "Hinzufügen".
                </p>
              ) : (
                inputFileSlots.map((slot, index) => (
                  <div key={slot.id} className="p-4 border rounded-md space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-primary">
                        Variable: {slot.variable}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeInputFileSlot(slot.id)}
                        data-testid={`button-remove-input-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Bezeichnung für Nutzer</Label>
                      <Input
                        value={slot.label}
                        onChange={(e) =>
                          updateInputFileSlot(slot.id, { label: e.target.value })
                        }
                        placeholder="z.B. PayPal Export, Transaktionsdaten"
                        data-testid={`input-file-label-${index}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Beschreibung (optional)</Label>
                      <Input
                        value={slot.description || ""}
                        onChange={(e) =>
                          updateInputFileSlot(slot.id, { description: e.target.value })
                        }
                        placeholder="z.B. CSV-Datei mit allen PayPal-Transaktionen"
                        data-testid={`input-file-description-${index}`}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Export-Dateien</CardTitle>
              <Button size="sm" variant="outline" onClick={addOutputFile} data-testid="button-add-output-file">
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {outputFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine Export-Dateien definiert. Klicken Sie auf "Hinzufügen".
                </p>
              ) : (
                outputFiles.map((file, index) => (
                  <div key={file.id} className="p-4 border rounded-md space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Export {index + 1}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeOutputFile(file.id)}
                        data-testid={`button-remove-output-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Dateiname</Label>
                        <Input
                          value={file.name}
                          onChange={(e) =>
                            updateOutputFile(file.id, { name: e.target.value })
                          }
                          placeholder="export_name"
                          data-testid={`input-output-name-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>DataFrame Variable</Label>
                        <Input
                          value={file.dataFrameVariable}
                          onChange={(e) =>
                            updateOutputFile(file.id, { dataFrameVariable: e.target.value })
                          }
                          placeholder="result"
                          data-testid={`input-output-variable-${index}`}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Format</Label>
                        <Select
                          value={file.format}
                          onValueChange={(value: "csv" | "xlsx" | "json") =>
                            updateOutputFile(file.id, { format: value, delimiter: value === 'csv' ? (file.delimiter || ';') : undefined })
                          }
                        >
                          <SelectTrigger data-testid={`select-output-format-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {file.format === 'csv' && (
                        <div className="space-y-2">
                          <Label>CSV-Trennzeichen</Label>
                          <Select
                            value={file.delimiter || ';'}
                            onValueChange={(value: ',' | ';' | '\t') =>
                              updateOutputFile(file.id, { delimiter: value })
                            }
                          >
                            <SelectTrigger data-testid={`select-output-delimiter-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value=";">Semikolon (;)</SelectItem>
                              <SelectItem value=",">Komma (,)</SelectItem>
                              <SelectItem value={'\t'}>Tab</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Macros Section */}
          {macros && macros.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Puzzle className="h-5 w-5" />
                  Macros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Fügen Sie wiederverwendbare Code-Bausteine hinzu:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {macros.map(macro => (
                      <Button
                        key={macro.id}
                        variant={usedMacroIds.includes(macro.id) ? "default" : "outline"}
                        size="sm"
                        onClick={() => insertMacro(macro)}
                        data-testid={`button-insert-macro-${macro.id}`}
                      >
                        <Puzzle className="h-4 w-4 mr-1" />
                        {macro.name}
                      </Button>
                    ))}
                  </div>
                  {usedMacroIds.length > 0 && (
                    <div className="mt-3 p-3 bg-muted rounded-md">
                      <p className="text-xs text-muted-foreground mb-2">
                        Verwendete Macros (Pattern-Dateien werden automatisch geladen):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {usedMacroIds.map(id => {
                          const macro = macros.find(m => m.id === id);
                          return macro ? (
                            <Badge key={id} variant="secondary" className="gap-1">
                              {macro.name}
                              <button
                                type="button"
                                onClick={() => removeMacro(id)}
                                className="ml-1 hover:text-destructive"
                                data-testid={`button-remove-macro-${id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Python Code Editor - Full Width Below */}
      <div className="mt-6 rounded-lg overflow-hidden border border-[#3c3c3c] shadow-lg">
        {/* Editor Header - Prettier Style */}
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
            <span className="text-[#3c3c3c]">|</span>
            <span>pandas</span>
            <span className="text-[#3c3c3c]">|</span>
            <span>openpyxl</span>
            <span className="text-[#3c3c3c]">|</span>
            <span>xlsxwriter</span>
          </div>
        </div>
        
        {/* Code Editor Area with Syntax Highlighting */}
        <div className="relative bg-[#1e1e1e] overflow-x-auto">
          <div className="flex min-w-max">
            {/* Line Numbers */}
            <div className="sticky left-0 z-10 select-none py-4 pr-4 pl-4 text-right text-[#858585] font-mono text-sm leading-6 bg-[#1e1e1e] border-r border-[#3c3c3c] min-w-[50px]">
              {pythonCode.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            
            {/* Code Editor with Overlay */}
            <div className="relative flex-1 min-w-[600px]">
              {/* Syntax Highlighted Layer (behind) */}
              <pre 
                className="absolute inset-0 font-mono text-sm leading-6 p-4 pointer-events-none whitespace-pre overflow-visible"
                style={{ tabSize: 4 }}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightPython(pythonCode) + '\n' }}
              />
              
              {/* Transparent Textarea (on top for editing) */}
              <textarea
                value={pythonCode}
                onChange={(e) => setPythonCode(e.target.value)}
                className="relative w-full bg-transparent text-transparent caret-white font-mono text-sm leading-6 p-4 resize-none outline-none min-h-[400px] whitespace-pre overflow-visible"
                placeholder="# Ihr Python-Code hier..."
                spellCheck={false}
                data-testid="textarea-python-code"
                style={{ tabSize: 4 }}
              />
            </div>
          </div>
        </div>
        
        {/* Editor Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#007acc] text-white text-xs">
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
  );
}
