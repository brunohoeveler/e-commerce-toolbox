import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  GripVertical,
  Columns,
  Type,
  Merge,
  Split,
  Filter,
  Link2,
  Save,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TransformationStep, InputFileSlot } from "@shared/schema";

interface ProcessBuilderPageProps {
  mandantId: string | null;
  processId?: string;
}

const TRANSFORMATION_TYPES = [
  { type: "remove_column", label: "Spalte entfernen", icon: Trash2, color: "bg-destructive/10 text-destructive" },
  { type: "add_column", label: "Spalte hinzufügen", icon: Plus, color: "bg-chart-2/10 text-chart-2" },
  { type: "rename_column", label: "Spalte umbenennen", icon: Type, color: "bg-primary/10 text-primary" },
  { type: "merge_columns", label: "Spalten zusammenführen", icon: Merge, color: "bg-chart-4/10 text-chart-4" },
  { type: "split_column", label: "Spalte aufteilen", icon: Split, color: "bg-chart-3/10 text-chart-3" },
  { type: "remove_string", label: "Text entfernen", icon: Type, color: "bg-chart-5/10 text-chart-5" },
  { type: "match_files", label: "Dateien matchen", icon: Link2, color: "bg-accent text-accent-foreground" },
  { type: "filter_rows", label: "Zeilen filtern", icon: Filter, color: "bg-muted text-muted-foreground" },
] as const;

interface UploadedFile {
  name: string;
  headers: string[];
  preview: string[][];
  totalRows: number;
}

export function ProcessBuilderPage({ mandantId, processId }: ProcessBuilderPageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditMode = !!processId;

  const [processName, setProcessName] = useState("");
  const [processDescription, setProcessDescription] = useState("");
  const [processType, setProcessType] = useState<"revenue" | "payments">("payments");
  const [inputFileSlots, setInputFileSlots] = useState<InputFileSlot[]>([
    { id: crypto.randomUUID(), name: "Datei 1", description: "", required: true }
  ]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [transformationSteps, setTransformationSteps] = useState<TransformationStep[]>([]);
  const [showAddStep, setShowAddStep] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { data: existingProcess, isLoading: isLoadingProcess } = useQuery({
    queryKey: ["/api/processes", processId],
    queryFn: async () => {
      const res = await fetch(`/api/processes/${processId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load process");
      return res.json();
    },
    enabled: isEditMode,
  });

  useEffect(() => {
    if (existingProcess && !isInitialized) {
      setProcessName(existingProcess.name || "");
      setProcessDescription(existingProcess.description || "");
      setProcessType(existingProcess.processType || "payments");
      
      const slots = existingProcess.inputFileSlots as InputFileSlot[];
      if (slots && slots.length > 0) {
        setInputFileSlots(slots);
      } else {
        const fileCount = existingProcess.inputFileCount || 1;
        const defaultSlots: InputFileSlot[] = Array.from({ length: fileCount }, (_, i) => ({
          id: crypto.randomUUID(),
          name: `Datei ${i + 1}`,
          description: "",
          required: true,
        }));
        setInputFileSlots(defaultSlots);
      }
      
      setTransformationSteps((existingProcess.transformationSteps as TransformationStep[]) || []);
      setIsInitialized(true);
    }
  }, [existingProcess, isInitialized]);

  const addFileSlot = () => {
    setInputFileSlots(prev => [...prev, {
      id: crypto.randomUUID(),
      name: `Datei ${prev.length + 1}`,
      description: "",
      required: true,
    }]);
  };

  const updateFileSlot = (id: string, updates: Partial<InputFileSlot>) => {
    setInputFileSlots(prev => prev.map(slot => 
      slot.id === id ? { ...slot, ...updates } : slot
    ));
  };

  const removeFileSlot = (id: string) => {
    setInputFileSlots(prev => prev.filter(slot => slot.id !== id));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode) {
        return apiRequest("PATCH", `/api/processes/${processId}`, {
          name: processName,
          description: processDescription,
          processType,
          inputFileCount: inputFileSlots.length,
          inputFileSlots,
          transformationSteps,
        });
      }
      return apiRequest("POST", "/api/processes", {
        mandantId,
        name: processName,
        description: processDescription,
        processType,
        inputFileCount: inputFileSlots.length,
        inputFileSlots,
        transformationSteps,
      });
    },
    onSuccess: () => {
      toast({
        title: isEditMode ? "Prozess aktualisiert" : "Prozess gespeichert",
        description: isEditMode ? "Der Prozess wurde erfolgreich aktualisiert." : "Der Prozess wurde erfolgreich angelegt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/processes"] });
      navigate("/processes");
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Prozess konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const lines = content.split("\n").filter(line => line.trim());
        const headers = lines[0]?.split(/[,;\t]/).map(h => h.trim().replace(/"/g, "")) || [];
        const preview = lines.slice(1, 6).map(line => 
          line.split(/[,;\t]/).map(cell => cell.trim().replace(/"/g, ""))
        );
        
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          headers,
          preview,
          totalRows: lines.length - 1,
        }]);
      };
      reader.readAsText(file);
    });
  }, []);

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const addTransformationStep = (type: TransformationStep["type"]) => {
    const newStep: TransformationStep = {
      id: crypto.randomUUID(),
      type,
      config: {},
    };
    setTransformationSteps(prev => [...prev, newStep]);
    setShowAddStep(false);
  };

  const removeTransformationStep = (id: string) => {
    setTransformationSteps(prev => prev.filter(step => step.id !== id));
  };

  const updateStepConfig = (id: string, config: Record<string, unknown>) => {
    setTransformationSteps(prev => 
      prev.map(step => step.id === id ? { ...step, config } : step)
    );
  };

  const allHeaders = uploadedFiles.flatMap(f => f.headers);
  const uniqueHeaders = Array.from(new Set(allHeaders));

  if (isEditMode && isLoadingProcess) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b border-border p-4 z-10">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/processes")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{isEditMode ? "Prozess bearbeiten" : "Neuer Prozess"}</h1>
              <p className="text-sm text-muted-foreground">
                {isEditMode ? "Bearbeiten Sie den Datentransformationsprozess" : "Erstellen Sie einen Datentransformationsprozess"}
              </p>
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!processName || saveMutation.isPending}
            data-testid="button-save-process"
          >
            <Save className="h-4 w-4 mr-2" />
            {isEditMode ? "Änderungen speichern" : "Prozess speichern"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6 pb-24">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Prozess-Details</CardTitle>
              <CardDescription>Grundlegende Informationen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="processName">Prozessname</Label>
                <Input
                  id="processName"
                  placeholder="z.B. PayPal Import"
                  value={processName}
                  onChange={(e) => setProcessName(e.target.value)}
                  data-testid="input-process-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="processType">Prozessart</Label>
                <Select value={processType} onValueChange={(val: "revenue" | "payments") => setProcessType(val)}>
                  <SelectTrigger id="processType" data-testid="select-process-type">
                    <SelectValue placeholder="Prozessart wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payments" data-testid="option-payments">Zahlungseingänge</SelectItem>
                    <SelectItem value="revenue" data-testid="option-revenue">Umsatzerlöse</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {processType === "payments" 
                    ? "Verarbeitet eingehende Zahlungen (z.B. PayPal, Stripe)" 
                    : "Erfasst Umsätze nach Ländern für Steuerberichte"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="processDescription">Beschreibung</Label>
                <Textarea
                  id="processDescription"
                  placeholder="Optionale Beschreibung..."
                  value={processDescription}
                  onChange={(e) => setProcessDescription(e.target.value)}
                  className="resize-none"
                  rows={3}
                  data-testid="input-process-description"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Input-Dateien</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addFileSlot}
                    data-testid="button-add-file-slot"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Hinzufügen
                  </Button>
                </div>
                <div className="space-y-2">
                  {inputFileSlots.map((slot, index) => (
                    <div key={slot.id} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          placeholder="Name der Datei"
                          value={slot.name}
                          onChange={(e) => updateFileSlot(slot.id, { name: e.target.value })}
                          className="flex-1"
                          data-testid={`input-file-slot-name-${index}`}
                        />
                        {inputFileSlots.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFileSlot(slot.id)}
                            data-testid={`button-remove-file-slot-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <Input
                        placeholder="Beschreibung (optional)"
                        value={slot.description || ""}
                        onChange={(e) => updateFileSlot(slot.id, { description: e.target.value })}
                        data-testid={`input-file-slot-description-${index}`}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`required-${slot.id}`}
                          checked={slot.required}
                          onChange={(e) => updateFileSlot(slot.id, { required: e.target.checked })}
                          className="rounded"
                        />
                        <label htmlFor={`required-${slot.id}`} className="text-sm text-muted-foreground">
                          Pflichtfeld
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Beispieldateien</CardTitle>
              <CardDescription>
                Laden Sie Beispieldateien hoch, um die Transformation zu konfigurieren
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Klicken oder Dateien hierher ziehen
                    </span>
                    <span className="text-xs text-muted-foreground">
                      CSV, TXT, XLSX unterstützt
                    </span>
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-3">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-md border border-border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.totalRows} Zeilen, {file.headers.length} Spalten
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(index)}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {uploadedFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Datenvorschau</CardTitle>
              <CardDescription>
                Erste Zeilen Ihrer hochgeladenen Dateien
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full">
                <div className="min-w-max">
                  {uploadedFiles.map((file, fileIndex) => (
                    <div key={fileIndex} className="mb-6 last:mb-0">
                      <h4 className="text-sm font-medium mb-2">{file.name}</h4>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-muted">
                            {file.headers.map((header, i) => (
                              <th key={i} className="border border-border px-3 py-2 text-left font-medium">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {file.preview.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="border border-border px-3 py-2">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transformationsschritte</CardTitle>
                <CardDescription>
                  Definieren Sie die Schritte zur Datenumwandlung
                </CardDescription>
              </div>
              <Dialog open={showAddStep} onOpenChange={setShowAddStep}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-step">
                    <Plus className="h-4 w-4 mr-2" />
                    Schritt hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Transformationsschritt wählen</DialogTitle>
                    <DialogDescription>
                      Wählen Sie die Art der Transformation
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2 py-4">
                    {TRANSFORMATION_TYPES.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => addTransformationStep(item.type)}
                        className="flex items-center gap-3 rounded-md border border-border p-3 text-left hover-elevate transition-colors"
                        data-testid={`button-add-${item.type}`}
                      >
                        <div className={`rounded-md p-2 ${item.color}`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {transformationSteps.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Columns className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Noch keine Transformationsschritte</p>
                <p className="text-sm">Fügen Sie Schritte hinzu, um Ihre Daten umzuwandeln</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transformationSteps.map((step, index) => {
                  const typeInfo = TRANSFORMATION_TYPES.find(t => t.type === step.type);
                  const Icon = typeInfo?.icon || Columns;
                  
                  return (
                    <div
                      key={step.id}
                      className="flex items-start gap-3 rounded-md border border-border p-4"
                      data-testid={`step-${step.id}`}
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <GripVertical className="h-4 w-4 cursor-grab" />
                        <Badge variant="secondary">{index + 1}</Badge>
                      </div>
                      <div className={`rounded-md p-2 ${typeInfo?.color || ""}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="font-medium">{typeInfo?.label}</div>
                        
                        {step.type === "remove_column" && (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Wählen Sie die zu löschenden Spalten:</p>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                              {uniqueHeaders.map((h) => {
                                const selectedColumns = (step.config.columns as string[]) || 
                                  (step.config.column ? [step.config.column as string] : []);
                                const isSelected = selectedColumns.includes(h);
                                return (
                                  <Badge
                                    key={h}
                                    variant={isSelected ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => {
                                      const newColumns = isSelected
                                        ? selectedColumns.filter(c => c !== h)
                                        : [...selectedColumns, h];
                                      updateStepConfig(step.id, { columns: newColumns, column: undefined });
                                    }}
                                    data-testid={`toggle-column-${h}`}
                                  >
                                    {h}
                                    {isSelected && <Check className="ml-1 h-3 w-3" />}
                                  </Badge>
                                );
                              })}
                            </div>
                            {((step.config.columns as string[])?.length || 0) > 0 && (
                              <p className="text-sm text-muted-foreground">
                                {(step.config.columns as string[]).length} Spalte(n) ausgewählt
                              </p>
                            )}
                          </div>
                        )}

                        {step.type === "add_column" && (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Spaltenname"
                              value={(step.config.columnName as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, columnName: e.target.value })}
                              className="w-40"
                            />
                            <Input
                              placeholder="Wert"
                              value={(step.config.value as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, value: e.target.value })}
                              className="flex-1"
                            />
                          </div>
                        )}

                        {step.type === "rename_column" && (
                          <div className="flex gap-2 items-center">
                            <Select
                              value={(step.config.oldName as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, oldName: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Alte Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {uniqueHeaders.map((h) => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-muted-foreground">→</span>
                            <Input
                              placeholder="Neuer Name"
                              value={(step.config.newName as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, newName: e.target.value })}
                              className="w-40"
                            />
                          </div>
                        )}

                        {step.type === "merge_columns" && (
                          <div className="space-y-2">
                            <div className="flex gap-2 flex-wrap">
                              <Select
                                value={(step.config.column1 as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column1: v })}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue placeholder="Spalte 1" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uniqueHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Verbindungstext"
                                value={(step.config.separator as string) || " - "}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, separator: e.target.value })}
                                className="w-32"
                              />
                              <Select
                                value={(step.config.column2 as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column2: v })}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue placeholder="Spalte 2" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uniqueHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              placeholder="Name der neuen Spalte"
                              value={(step.config.newColumnName as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, newColumnName: e.target.value })}
                              className="w-64"
                            />
                          </div>
                        )}

                        {step.type === "split_column" && (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Select
                                value={(step.config.column as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uniqueHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Trennzeichen"
                                value={(step.config.delimiter as string) || ""}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, delimiter: e.target.value })}
                                className="w-32"
                              />
                            </div>
                          </div>
                        )}

                        {step.type === "remove_string" && (
                          <div className="flex gap-2">
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {uniqueHeaders.map((h) => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Zu entfernender Text"
                              value={(step.config.searchString as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, searchString: e.target.value })}
                              className="flex-1"
                            />
                          </div>
                        )}

                        {step.type === "match_files" && (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Select
                                value={(step.config.file1Column as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, file1Column: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte Datei 1" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uniqueHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-muted-foreground flex items-center">=</span>
                              <Select
                                value={(step.config.file2Column as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, file2Column: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte Datei 2" />
                                </SelectTrigger>
                                <SelectContent>
                                  {uniqueHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {step.type === "filter_rows" && (
                          <div className="flex gap-2 flex-wrap">
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {uniqueHeaders.map((h) => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={(step.config.operator as string) || "equals"}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, operator: v })}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Gleich</SelectItem>
                                <SelectItem value="contains">Enthält</SelectItem>
                                <SelectItem value="not_equals">Ungleich</SelectItem>
                                <SelectItem value="not_contains">Enthält nicht</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Wert"
                              value={(step.config.value as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, value: e.target.value })}
                              className="w-40"
                            />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTransformationStep(step.id)}
                        data-testid={`button-remove-step-${step.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
