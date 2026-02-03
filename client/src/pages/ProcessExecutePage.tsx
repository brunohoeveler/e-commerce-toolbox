import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, Play, Download, FileCode, Loader2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Process, InputFileSlot, OutputFile } from "@shared/schema";

interface ProcessExecutePageProps {
  mandantId: string | null;
  processId: string;
}

interface UploadedFile {
  slotId: string;
  file: File;
  uploaded: boolean;
}

interface ExecutionResult {
  success: boolean;
  error?: string;
  outputs?: {
    name: string;
    format: string;
    downloadUrl: string;
  }[];
}

export function ProcessExecutePage({ mandantId, processId }: ProcessExecutePageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<Map<string, File>>(new Map());
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  const { data: process, isLoading: processLoading } = useQuery<Process>({
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
    mutationFn: async (formData: FormData) => {
      const res = await fetch(`/api/processes/${processId}/execute`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Execution failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setExecutionResult(data);
      toast({
        title: "Prozess ausgeführt",
        description: "Die Transformation wurde erfolgreich durchgeführt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/process-executions"] });
    },
    onError: (error: Error) => {
      setExecutionResult({
        success: false,
        error: error.message,
      });
      toast({
        title: "Fehler bei der Ausführung",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (slotId: string, file: File | null) => {
    const newFiles = new Map(uploadedFiles);
    if (file) {
      newFiles.set(slotId, file);
    } else {
      newFiles.delete(slotId);
    }
    setUploadedFiles(newFiles);
  };

  const handleExecute = () => {
    if (!process) return;

    const inputFileSlots = process.inputFileSlots as InputFileSlot[];
    const missingFiles = inputFileSlots.filter(
      (slot) => slot.required && !uploadedFiles.has(slot.id)
    );

    if (missingFiles.length > 0) {
      toast({
        title: "Fehlende Dateien",
        description: `Bitte laden Sie alle erforderlichen Dateien hoch: ${missingFiles.map((s) => s.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    uploadedFiles.forEach((file, slotId) => {
      formData.append(`file_${slotId}`, file);
    });

    // Add slot mapping for the backend
    const slotMapping: Record<string, string> = {};
    inputFileSlots.forEach((slot) => {
      slotMapping[slot.id] = slot.variable;
    });
    formData.append("slotMapping", JSON.stringify(slotMapping));

    setExecutionResult(null);
    executeMutation.mutate(formData);
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

  if (processLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!process) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <X className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="font-semibold text-lg mb-2">Prozess nicht gefunden</h3>
            <Button variant="outline" onClick={() => navigate("/processes")}>
              Zurück zur Übersicht
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inputFileSlots = process.inputFileSlots as InputFileSlot[];
  const outputFiles = process.outputFiles as OutputFile[];
  const allRequiredFilesUploaded = inputFileSlots
    .filter((slot) => slot.required)
    .every((slot) => uploadedFiles.has(slot.id));

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/processes")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{process.name}</h1>
          {process.description && (
            <p className="text-muted-foreground">{process.description}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Input-Dateien hochladen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {inputFileSlots.map((slot, index) => (
              <div key={slot.id} className="p-4 border rounded-md space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-medium">
                    {slot.label}
                    {slot.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Badge variant="secondary">{slot.variable}</Badge>
                </div>
                {slot.description && (
                  <p className="text-sm text-muted-foreground">{slot.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls,.json"
                    onChange={(e) => handleFileChange(slot.id, e.target.files?.[0] || null)}
                    data-testid={`input-file-${index}`}
                  />
                  {uploadedFiles.has(slot.id) && (
                    <Check className="h-5 w-5 text-chart-2 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}

            <Button
              onClick={handleExecute}
              disabled={!allRequiredFilesUploaded || executeMutation.isPending}
              className="w-full"
              data-testid="button-execute-process"
            >
              {executeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird ausgeführt...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Prozess ausführen
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export-Dateien
            </CardTitle>
          </CardHeader>
          <CardContent>
            {executionResult ? (
              executionResult.success ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-chart-2">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">Transformation erfolgreich</span>
                  </div>
                  {executionResult.outputs?.map((output, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <p className="font-medium">{output.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Format: {output.format.toUpperCase()}
                        </p>
                      </div>
                      <a href={output.downloadUrl} download>
                        <Button variant="outline" size="sm" data-testid={`button-download-${index}`}>
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <X className="h-5 w-5" />
                    <span className="font-medium">Fehler bei der Ausführung</span>
                  </div>
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm font-mono whitespace-pre-wrap">{executionResult.error}</p>
                  </div>
                </div>
              )
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Führen Sie den Prozess aus, um Export-Dateien zu generieren.</p>
                <div className="mt-4 space-y-2">
                  {outputFiles.map((file, index) => (
                    <div key={file.id} className="text-sm">
                      <span className="font-medium">{file.name}</span>
                      <span className="text-muted-foreground"> ({file.format.toUpperCase()})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
