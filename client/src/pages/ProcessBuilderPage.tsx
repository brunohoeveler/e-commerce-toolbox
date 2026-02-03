import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save, Plus, Trash2, ArrowLeft, FileCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { InputFileSlot, OutputFile, Process } from "@shared/schema";

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
    });
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
                    <div className="grid gap-3 sm:grid-cols-3">
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
                      <div className="space-y-2">
                        <Label>Format</Label>
                        <Select
                          value={file.format}
                          onValueChange={(value: "csv" | "xlsx" | "json") =>
                            updateOutputFile(file.id, { format: value })
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
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Python Code</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={pythonCode}
                onChange={(e) => setPythonCode(e.target.value)}
                className="font-mono text-sm min-h-[500px] resize-none"
                placeholder="# Ihr Python-Code hier..."
                data-testid="textarea-python-code"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Verfügbare Bibliotheken: polars, pandas, openpyxl, xlsxwriter
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
