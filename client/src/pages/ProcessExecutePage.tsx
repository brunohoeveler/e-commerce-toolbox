import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Play,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Process, InputFileSlot } from "@shared/schema";

interface ProcessExecutePageProps {
  processId: string;
  mandantId: string | null;
}

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

interface UploadedFile {
  slotId: string;
  name: string;
  content: string;
  headers: string[];
  rowCount: number;
}

export function ProcessExecutePage({ processId, mandantId }: ProcessExecutePageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const currentDate = new Date();
  
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const { data: process, isLoading } = useQuery<Process>({
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

  const executeMutation = useMutation({
    mutationFn: async () => {
      const inputFilesData = uploadedFiles.map(f => ({
        slotId: f.slotId,
        name: f.name,
        content: f.content,
      }));
      
      return apiRequest("POST", `/api/processes/${processId}/execute`, {
        month: selectedMonth,
        year: selectedYear,
        inputFiles: inputFilesData,
      });
    },
    onSuccess: () => {
      toast({
        title: "Prozess erfolgreich ausgeführt",
        description: `Daten für ${MONTHS[selectedMonth - 1]} ${selectedYear} wurden verarbeitet.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/process-executions"] });
      navigate("/exports");
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Prozess konnte nicht ausgeführt werden.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = useCallback((slotId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split(/\r?\n/).filter(line => line.trim());
      const headers = lines[0]?.split(/[,;\t]/).map(h => h.trim().replace(/"/g, "")) || [];
      
      setUploadedFiles(prev => {
        const filtered = prev.filter(f => f.slotId !== slotId);
        return [...filtered, {
          slotId,
          name: file.name,
          content,
          headers,
          rowCount: lines.length - 1,
        }];
      });
    };
    reader.readAsText(file);
  }, []);

  const rawSlots = process?.inputFileSlots as InputFileSlot[] | undefined;
  const inputFileSlots: InputFileSlot[] = (rawSlots && rawSlots.length > 0) 
    ? rawSlots 
    : Array.from({ length: process?.inputFileCount || 0 }, (_, i) => ({
        id: `legacy-slot-${i}`,
        name: `Datei ${i + 1}`,
        description: "",
        required: true,
      }));
  
  const requiredSlots = inputFileSlots.filter(s => s.required);
  const allRequiredUploaded = inputFileSlots.length === 0 
    ? false  
    : requiredSlots.length === 0 
      ? true  
      : requiredSlots.every(slot => uploadedFiles.some(f => f.slotId === slot.id));

  const uploadProgress = inputFileSlots.length > 0
    ? Math.round((uploadedFiles.length / inputFileSlots.length) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!process) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="font-semibold text-lg mb-2">Prozess nicht gefunden</h3>
            <Button onClick={() => navigate("/processes")} className="mt-4">
              Zurück zu Prozessen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b border-border p-4 z-10">
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/processes")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{process.name} ausführen</h1>
              <p className="text-sm text-muted-foreground">
                Laden Sie die aktuellen Daten hoch
              </p>
            </div>
          </div>
          <Button
            onClick={() => executeMutation.mutate()}
            disabled={!allRequiredUploaded || executeMutation.isPending}
            data-testid="button-execute-process"
          >
            <Play className="h-4 w-4 mr-2" />
            {executeMutation.isPending ? "Wird ausgeführt..." : "Prozess ausführen"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Abrechnungszeitraum
              </CardTitle>
              <CardDescription>
                Wählen Sie den Monat und das Jahr für diese Datenverarbeitung
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Monat</label>
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(v) => setSelectedMonth(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, idx) => (
                        <SelectItem key={idx} value={(idx + 1).toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <label className="text-sm font-medium mb-2 block">Jahr</label>
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(v) => setSelectedYear(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[currentDate.getFullYear() - 1, currentDate.getFullYear(), currentDate.getFullYear() + 1].map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Input-Dateien hochladen
                  </CardTitle>
                  <CardDescription>
                    Laden Sie die Dateien für die Verarbeitung hoch
                  </CardDescription>
                </div>
                {inputFileSlots.length > 0 && (
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground mb-1">
                      {uploadedFiles.length} von {inputFileSlots.length} Dateien
                    </div>
                    <Progress value={uploadProgress} className="w-32 h-2" />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {inputFileSlots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Für diesen Prozess sind keine Input-Dateien definiert.</p>
                  <p className="text-sm mt-2">
                    Bearbeiten Sie den Prozess, um Input-Dateien hinzuzufügen.
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => navigate(`/processes/${processId}/edit`)}
                  >
                    Prozess bearbeiten
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {inputFileSlots.map((slot) => {
                    const uploadedFile = uploadedFiles.find(f => f.slotId === slot.id);
                    
                    return (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between rounded-lg border border-border p-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`rounded-md p-2 ${uploadedFile ? 'bg-chart-2/10 text-chart-2' : 'bg-muted text-muted-foreground'}`}>
                            <FileSpreadsheet className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{slot.name}</span>
                              {slot.required && (
                                <Badge variant="secondary" className="text-xs">Pflicht</Badge>
                              )}
                            </div>
                            {slot.description && (
                              <p className="text-sm text-muted-foreground">{slot.description}</p>
                            )}
                            {uploadedFile && (
                              <p className="text-sm text-chart-2 mt-1">
                                <CheckCircle2 className="h-3 w-3 inline mr-1" />
                                {uploadedFile.name} ({uploadedFile.rowCount} Zeilen)
                              </p>
                            )}
                          </div>
                        </div>
                        <div>
                          <input
                            type="file"
                            accept=".csv,.txt,.xlsx,.xls"
                            onChange={(e) => handleFileUpload(slot.id, e)}
                            className="hidden"
                            id={`file-upload-${slot.id}`}
                          />
                          <label htmlFor={`file-upload-${slot.id}`}>
                            <Button variant={uploadedFile ? "outline" : "default"} asChild>
                              <span className="cursor-pointer">
                                <Upload className="h-4 w-4 mr-2" />
                                {uploadedFile ? "Ersetzen" : "Hochladen"}
                              </span>
                            </Button>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {process.description && (
            <Card>
              <CardHeader>
                <CardTitle>Prozessbeschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{process.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
