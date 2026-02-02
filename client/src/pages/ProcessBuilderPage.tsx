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
  GitBranch,
  Replace,
  Scissors,
  ArrowUpDown,
  Copy,
  Calculator,
  Hash,
  ListFilter,
  Layers,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  { type: "remove_column", label: "Spalte entfernen", icon: Trash2, color: "bg-destructive/10 text-destructive", category: "columns" },
  { type: "add_column", label: "Spalte hinzufügen", icon: Plus, color: "bg-chart-2/10 text-chart-2", category: "columns" },
  { type: "rename_column", label: "Spalte umbenennen", icon: Type, color: "bg-primary/10 text-primary", category: "columns" },
  { type: "select_columns", label: "Spalten auswählen", icon: ListFilter, color: "bg-chart-4/10 text-chart-4", category: "columns" },
  { type: "merge_columns", label: "Spalten zusammenführen", icon: Merge, color: "bg-chart-4/10 text-chart-4", category: "columns" },
  { type: "split_column", label: "Spalte aufteilen", icon: Split, color: "bg-chart-3/10 text-chart-3", category: "columns" },
  { type: "replace_text", label: "Text ersetzen", icon: Replace, color: "bg-chart-5/10 text-chart-5", category: "text" },
  { type: "remove_string", label: "Text entfernen", icon: Type, color: "bg-chart-5/10 text-chart-5", category: "text" },
  { type: "extract_substring", label: "Text extrahieren", icon: Scissors, color: "bg-chart-3/10 text-chart-3", category: "text" },
  { type: "filter_rows", label: "Zeilen filtern", icon: Filter, color: "bg-muted text-muted-foreground", category: "rows" },
  { type: "remove_duplicates", label: "Duplikate entfernen", icon: Copy, color: "bg-chart-1/10 text-chart-1", category: "rows" },
  { type: "sort_rows", label: "Zeilen sortieren", icon: ArrowUpDown, color: "bg-primary/10 text-primary", category: "rows" },
  { type: "match_files", label: "Dateien matchen", icon: Link2, color: "bg-accent text-accent-foreground", category: "files" },
  { type: "concat_files", label: "Dateien zusammenfügen", icon: Layers, color: "bg-chart-2/10 text-chart-2", category: "files" },
  { type: "conditional", label: "Wenn-Dann-Sonst", icon: GitBranch, color: "bg-chart-1/10 text-chart-1", category: "logic" },
  { type: "calculate", label: "Berechnung", icon: Calculator, color: "bg-chart-4/10 text-chart-4", category: "logic" },
  { type: "debit_credit", label: "Soll/Haben", icon: Hash, color: "bg-chart-3/10 text-chart-3", category: "accounting" },
  { type: "format_number", label: "Zahl formatieren", icon: Hash, color: "bg-chart-5/10 text-chart-5", category: "format" },
  { type: "format_date", label: "Datum formatieren", icon: Type, color: "bg-primary/10 text-primary", category: "format" },
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
    setInputFileSlots(prev => prev.map((slot, index) => {
      if (slot.id !== id) return slot;
      
      const newSlot = { ...slot, ...updates };
      
      if (updates.inputType) {
        const defaultFileName = `Datei ${index + 1}`;
        const defaultManualName = `Betrag ${index + 1}`;
        
        if (updates.inputType === 'manual' && (slot.name === defaultFileName || slot.name.startsWith('Datei '))) {
          newSlot.name = defaultManualName;
        } else if (updates.inputType === 'file' && (slot.name === defaultManualName || slot.name.startsWith('Betrag '))) {
          newSlot.name = defaultFileName;
        }
      }
      
      return newSlot;
    }));
  };

  const removeFileSlot = (id: string) => {
    setInputFileSlots(prev => prev.filter(slot => slot.id !== id));
  };

  const isAllManualInput = inputFileSlots.length > 0 && inputFileSlots.every(slot => slot.inputType === 'manual');
  const hasAnyFileSlot = inputFileSlots.some(slot => !slot.inputType || slot.inputType === 'file');

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

  const processFiles = useCallback((files: FileList | File[]) => {
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

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    processFiles(files);
  }, [processFiles]);

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

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
  
  const headersWithSource: { header: string; source: string; slotName: string }[] = [];
  const headersBySlot: Record<string, { headers: string[]; slotName: string }> = {};
  
  uploadedFiles.forEach((file, fileIndex) => {
    const slot = inputFileSlots[fileIndex];
    const slotName = slot?.name || `Datei ${fileIndex + 1}`;
    
    if (!headersBySlot[slotName]) {
      headersBySlot[slotName] = { headers: [], slotName };
    }
    
    file.headers.forEach(header => {
      if (!headersWithSource.find(h => h.header === header)) {
        headersWithSource.push({ header, source: file.name, slotName });
      }
      if (!headersBySlot[slotName].headers.includes(header)) {
        headersBySlot[slotName].headers.push(header);
      }
    });
  });
  
  const renderGroupedColumnOptions = () => {
    const slots = Object.keys(headersBySlot);
    if (slots.length <= 1) {
      return uniqueHeaders.map((h) => (
        <SelectItem key={h} value={h}>{h}</SelectItem>
      ));
    }
    return slots.map(slotName => (
      <SelectGroup key={slotName}>
        <SelectLabel className="text-xs text-muted-foreground">{slotName}</SelectLabel>
        {headersBySlot[slotName].headers.map(header => (
          <SelectItem key={`${slotName}-${header}`} value={header}>
            {header}
          </SelectItem>
        ))}
      </SelectGroup>
    ));
  };

  const applyTransformations = useCallback(() => {
    if (uploadedFiles.length === 0) return null;
    
    let headers = [...uploadedFiles[0].headers];
    let rows = uploadedFiles[0].preview.map(row => [...row]);
    
    const fileDataBySlot: Record<string, { headers: string[]; rows: string[][] }> = {};
    uploadedFiles.forEach((file, index) => {
      const slot = inputFileSlots[index];
      const slotName = slot?.name || `Datei ${index + 1}`;
      fileDataBySlot[slotName] = {
        headers: [...file.headers],
        rows: file.preview.map(row => [...row])
      };
    });
    
    for (const step of transformationSteps) {
      switch (step.type) {
        case "remove_column": {
          const columnsToRemove = (step.config.columns as string[]) || 
            (step.config.column ? [step.config.column as string] : []);
          const indicesToRemove = columnsToRemove
            .map(col => headers.indexOf(col))
            .filter(i => i !== -1)
            .sort((a, b) => b - a);
          
          for (const idx of indicesToRemove) {
            headers.splice(idx, 1);
            rows = rows.map(row => {
              const newRow = [...row];
              newRow.splice(idx, 1);
              return newRow;
            });
          }
          break;
        }
        case "add_column": {
          const columnName = step.config.columnName as string;
          const value = step.config.value as string || "";
          if (columnName) {
            headers.push(columnName);
            rows = rows.map(row => [...row, value]);
          }
          break;
        }
        case "rename_column": {
          const oldName = step.config.oldName as string;
          const newName = step.config.newName as string;
          const idx = headers.indexOf(oldName);
          if (idx !== -1 && newName) {
            headers[idx] = newName;
          }
          break;
        }
        case "merge_columns": {
          const column1 = step.config.column1 as string;
          const column2 = step.config.column2 as string;
          const newColumnName = step.config.newColumnName as string;
          const separator = (step.config.separator as string) || "";
          if (column1 && column2 && newColumnName) {
            const idx1 = headers.indexOf(column1);
            const idx2 = headers.indexOf(column2);
            if (idx1 !== -1 && idx2 !== -1) {
              headers.push(newColumnName);
              rows = rows.map(row => {
                const mergedValue = (row[idx1] || "") + separator + (row[idx2] || "");
                return [...row, mergedValue];
              });
            }
          }
          break;
        }
        case "remove_string": {
          const column = step.config.column as string;
          const searchString = step.config.searchString as string;
          const idx = headers.indexOf(column);
          if (idx !== -1 && searchString) {
            rows = rows.map(row => {
              const newRow = [...row];
              newRow[idx] = (newRow[idx] || "").replace(new RegExp(searchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "");
              return newRow;
            });
          }
          break;
        }
        case "filter_rows": {
          const column = step.config.column as string;
          const operator = step.config.operator as string;
          const filterValue = step.config.value as string;
          const idx = headers.indexOf(column);
          if (idx !== -1 && operator && filterValue !== undefined) {
            rows = rows.filter(row => {
              const cellValue = row[idx] || "";
              switch (operator) {
                case "equals": return cellValue === filterValue;
                case "contains": return cellValue.includes(filterValue);
                case "not_equals": return cellValue !== filterValue;
                case "not_contains": return !cellValue.includes(filterValue);
                default: return true;
              }
            });
          }
          break;
        }
        case "split_column": {
          const column = step.config.column as string;
          const separator = step.config.separator as string;
          const newColumn1 = step.config.newColumn1 as string;
          const newColumn2 = step.config.newColumn2 as string;
          const idx = headers.indexOf(column);
          if (idx !== -1 && separator && newColumn1 && newColumn2) {
            headers.push(newColumn1, newColumn2);
            rows = rows.map(row => {
              const parts = (row[idx] || "").split(separator);
              return [...row, parts[0] || "", parts.slice(1).join(separator) || ""];
            });
          }
          break;
        }
        case "match_files": {
          const file1Column = step.config.file1Column as string;
          const file2Column = step.config.file2Column as string;
          const file2Slot = Object.keys(fileDataBySlot).find(slot => 
            fileDataBySlot[slot].headers.includes(file2Column)
          );
          
          if (file1Column && file2Column && file2Slot) {
            const file2Data = fileDataBySlot[file2Slot];
            const idx1 = headers.indexOf(file1Column);
            const idx2 = file2Data.headers.indexOf(file2Column);
            
            if (idx1 !== -1 && idx2 !== -1) {
              const newHeadersFromFile2 = file2Data.headers.filter(h => !headers.includes(h));
              headers = [...headers, ...newHeadersFromFile2];
              
              const file2Map = new Map<string, string[]>();
              file2Data.rows.forEach(row => {
                const key = row[idx2] || "";
                if (!file2Map.has(key)) {
                  file2Map.set(key, row);
                }
              });
              
              rows = rows.map(row => {
                const key = row[idx1] || "";
                const matchedRow = file2Map.get(key);
                if (matchedRow) {
                  const additionalValues = file2Data.headers
                    .filter(h => !uploadedFiles[0].headers.includes(h))
                    .map((h, i) => {
                      const origIdx = file2Data.headers.indexOf(h);
                      return matchedRow[origIdx] || "";
                    });
                  return [...row, ...additionalValues];
                }
                return [...row, ...new Array(newHeadersFromFile2.length).fill("")];
              });
            }
          }
          break;
        }
        case "conditional": {
          const sourceColumn = step.config.sourceColumn as string;
          const condition = step.config.condition as string;
          const searchValue = step.config.searchValue as string || "";
          const targetType = step.config.targetType as string;
          const targetColumn = step.config.targetColumn as string;
          const thenValue = step.config.thenValue as string || "";
          const elseValue = step.config.elseValue as string || "";
          
          const sourceIdx = headers.indexOf(sourceColumn);
          let targetIdx = headers.indexOf(targetColumn);
          
          if (sourceIdx !== -1 && targetColumn) {
            if (targetType === "new" && targetIdx === -1) {
              headers.push(targetColumn);
              targetIdx = headers.length - 1;
              rows = rows.map(row => [...row, ""]);
            }
            
            if (targetIdx !== -1) {
              rows = rows.map(row => {
                const newRow = [...row];
                const sourceValue = row[sourceIdx] || "";
                let matches = false;
                
                switch (condition) {
                  case "contains": matches = sourceValue.includes(searchValue); break;
                  case "equals": matches = sourceValue === searchValue; break;
                  case "not_contains": matches = !sourceValue.includes(searchValue); break;
                  case "not_equals": matches = sourceValue !== searchValue; break;
                  case "starts_with": matches = sourceValue.startsWith(searchValue); break;
                  case "ends_with": matches = sourceValue.endsWith(searchValue); break;
                  case "is_empty": matches = sourceValue === ""; break;
                  case "is_not_empty": matches = sourceValue !== ""; break;
                  default: matches = false;
                }
                
                if (matches) {
                  newRow[targetIdx] = thenValue;
                } else if (elseValue) {
                  newRow[targetIdx] = elseValue;
                }
                
                return newRow;
              });
            }
          }
          break;
        }
        case "replace_text": {
          const column = step.config.column as string;
          const searchText = step.config.searchText as string;
          const replaceText = step.config.replaceText as string || "";
          const idx = headers.indexOf(column);
          if (idx !== -1 && searchText) {
            rows = rows.map(row => {
              const newRow = [...row];
              newRow[idx] = (newRow[idx] || "").replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
              return newRow;
            });
          }
          break;
        }
        case "extract_substring": {
          const column = step.config.column as string;
          const startPos = parseInt(step.config.startPos as string) || 0;
          const length = parseInt(step.config.length as string) || 0;
          const idx = headers.indexOf(column);
          if (idx !== -1) {
            rows = rows.map(row => {
              const newRow = [...row];
              const value = newRow[idx] || "";
              newRow[idx] = length > 0 ? value.substring(startPos, startPos + length) : value.substring(startPos);
              return newRow;
            });
          }
          break;
        }
        case "select_columns": {
          const selectedCols = (step.config.columns as string[]) || [];
          if (selectedCols.length > 0) {
            const indices = selectedCols.map(c => headers.indexOf(c)).filter(i => i !== -1);
            headers = indices.map(i => headers[i]);
            rows = rows.map(row => indices.map(i => row[i]));
          }
          break;
        }
        case "remove_duplicates": {
          const column = step.config.column as string;
          const idx = headers.indexOf(column);
          if (idx !== -1) {
            const seen = new Set<string>();
            rows = rows.filter(row => {
              const value = row[idx] || "";
              if (seen.has(value)) return false;
              seen.add(value);
              return true;
            });
          }
          break;
        }
        case "sort_rows": {
          const column = step.config.column as string;
          const direction = step.config.direction as string || "asc";
          const idx = headers.indexOf(column);
          if (idx !== -1) {
            rows = [...rows].sort((a, b) => {
              const valA = a[idx] || "";
              const valB = b[idx] || "";
              const numA = parseFloat(valA);
              const numB = parseFloat(valB);
              if (!isNaN(numA) && !isNaN(numB)) {
                return direction === "asc" ? numA - numB : numB - numA;
              }
              return direction === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
            });
          }
          break;
        }
        case "concat_files": {
          const file2Slot = step.config.file2Slot as string;
          if (file2Slot && fileDataBySlot[file2Slot]) {
            const file2Data = fileDataBySlot[file2Slot];
            const file2Rows = file2Data.rows.map(row => {
              const newRow = headers.map(h => {
                const idx = file2Data.headers.indexOf(h);
                return idx !== -1 ? row[idx] : "";
              });
              return newRow;
            });
            rows = [...rows, ...file2Rows];
          }
          break;
        }
        case "calculate": {
          const column1 = step.config.column1 as string;
          const operator = step.config.operator as string;
          const column2 = step.config.column2 as string;
          const resultColumn = step.config.resultColumn as string;
          const idx1 = headers.indexOf(column1);
          const idx2 = headers.indexOf(column2);
          if (idx1 !== -1 && resultColumn) {
            if (!headers.includes(resultColumn)) {
              headers.push(resultColumn);
              rows = rows.map(row => [...row, ""]);
            }
            const resultIdx = headers.indexOf(resultColumn);
            rows = rows.map(row => {
              const newRow = [...row];
              const val1 = parseFloat((row[idx1] || "0").replace(",", ".")) || 0;
              const val2 = idx2 !== -1 ? parseFloat((row[idx2] || "0").replace(",", ".")) || 0 : parseFloat((step.config.value as string) || "0");
              let result = 0;
              switch (operator) {
                case "add": result = val1 + val2; break;
                case "subtract": result = val1 - val2; break;
                case "multiply": result = val1 * val2; break;
                case "divide": result = val2 !== 0 ? val1 / val2 : 0; break;
                case "abs": result = Math.abs(val1); break;
              }
              newRow[resultIdx] = result.toString().replace(".", ",");
              return newRow;
            });
          }
          break;
        }
        case "debit_credit": {
          const amountColumn = step.config.amountColumn as string;
          const targetColumn = step.config.targetColumn as string || "SH";
          const debitValue = step.config.debitValue as string || "S";
          const creditValue = step.config.creditValue as string || "H";
          const amountIdx = headers.indexOf(amountColumn);
          if (amountIdx !== -1 && targetColumn) {
            if (!headers.includes(targetColumn)) {
              headers.push(targetColumn);
              rows = rows.map(row => [...row, ""]);
            }
            const targetIdx = headers.indexOf(targetColumn);
            rows = rows.map(row => {
              const newRow = [...row];
              const amount = parseFloat((row[amountIdx] || "0").replace(",", "."));
              newRow[targetIdx] = amount >= 0 ? debitValue : creditValue;
              return newRow;
            });
          }
          break;
        }
        case "format_number": {
          const column = step.config.column as string;
          const decimalSeparator = step.config.decimalSeparator as string || ",";
          const thousandSeparator = step.config.thousandSeparator as string || "";
          const decimals = parseInt(step.config.decimals as string) || 2;
          const removeSign = step.config.removeSign as boolean || false;
          const idx = headers.indexOf(column);
          if (idx !== -1) {
            rows = rows.map(row => {
              const newRow = [...row];
              let val = parseFloat((newRow[idx] || "0").replace(",", "."));
              if (removeSign) val = Math.abs(val);
              let formatted = val.toFixed(decimals);
              if (decimalSeparator !== ".") {
                formatted = formatted.replace(".", decimalSeparator);
              }
              if (thousandSeparator) {
                const parts = formatted.split(decimalSeparator);
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
                formatted = parts.join(decimalSeparator);
              }
              newRow[idx] = formatted;
              return newRow;
            });
          }
          break;
        }
        case "format_date": {
          const column = step.config.column as string;
          const outputFormat = step.config.outputFormat as string || "DDMM";
          const idx = headers.indexOf(column);
          if (idx !== -1) {
            rows = rows.map(row => {
              const newRow = [...row];
              const value = newRow[idx] || "";
              let formatted = value.replace(/\./g, "").replace(/\-/g, "").replace(/\//g, "");
              if (outputFormat === "DDMM") {
                formatted = formatted.substring(0, 4);
              } else if (outputFormat === "DDMMYYYY") {
                formatted = formatted.substring(0, 8);
              }
              newRow[idx] = formatted;
              return newRow;
            });
          }
          break;
        }
      }
    }
    
    return { headers, rows };
  }, [uploadedFiles, transformationSteps, inputFileSlots]);

  const transformedPreview = applyTransformations();

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
                      <div className="flex items-center gap-4">
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
                        <div className="flex items-center gap-2">
                          <Select
                            value={slot.inputType || "file"}
                            onValueChange={(value) => updateFileSlot(slot.id, { inputType: value as 'file' | 'manual' })}
                          >
                            <SelectTrigger className="w-40" data-testid={`select-input-type-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="file">Datei-Upload</SelectItem>
                              <SelectItem value="manual">Manuelle Eingabe</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{isAllManualInput ? "Belege" : "Beispieldateien"}</CardTitle>
              <CardDescription>
                {isAllManualInput 
                  ? "Bei der Ausführung können Sie Belege (PDF, Bilder) zu den manuellen Beträgen hochladen"
                  : "Laden Sie Beispieldateien hoch, um die Transformation zu konfigurieren"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAllManualInput ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Keine Beispieldateien erforderlich</p>
                  <p className="text-sm">Bei manueller Eingabe geben Sie Beträge direkt bei der Ausführung ein</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDragging 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50"
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    data-testid="dropzone-file-upload"
                  >
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
                      <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm ${isDragging ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        {isDragging ? "Dateien hier ablegen" : "Klicken oder Dateien hierher ziehen"}
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
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                              {index + 1}
                            </div>
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                            <div>
                              <p className="text-sm font-medium">
                                <span className="text-muted-foreground mr-1">Datei {index + 1}:</span>
                                {file.name}
                              </p>
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
              )}
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
              <div className="space-y-6">
                {uploadedFiles.map((file, fileIndex) => (
                  <div key={fileIndex}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {fileIndex + 1}
                      </div>
                      <h4 className="text-sm font-medium">Datei {fileIndex + 1}: {file.name}</h4>
                    </div>
                    <div className="overflow-x-auto border border-border rounded-md">
                      <table className="w-full border-collapse text-sm min-w-max">
                        <thead>
                          <tr className="bg-muted">
                            {file.headers.map((header, i) => (
                              <th key={i} className="border-b border-r last:border-r-0 border-border px-3 py-2 text-left font-medium whitespace-nowrap">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {file.preview.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-muted/50">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="border-b border-r last:border-r-0 border-border px-3 py-2 whitespace-nowrap">
                                  {cell || <span className="text-muted-foreground italic">leer</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {hasAnyFileSlot && (
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
                              {headersWithSource.map((item) => {
                                const selectedColumns = (step.config.columns as string[]) || 
                                  (step.config.column ? [step.config.column as string] : []);
                                const isSelected = selectedColumns.includes(item.header);
                                return (
                                  <Badge
                                    key={`${item.slotName}-${item.header}`}
                                    variant={isSelected ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => {
                                      const newColumns = isSelected
                                        ? selectedColumns.filter(c => c !== item.header)
                                        : [...selectedColumns, item.header];
                                      updateStepConfig(step.id, { columns: newColumns, column: undefined });
                                    }}
                                    data-testid={`toggle-column-${item.header}`}
                                  >
                                    <span className="text-xs text-muted-foreground mr-1">[{item.slotName}]</span>
                                    {item.header}
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
                                {renderGroupedColumnOptions()}
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
                                  {renderGroupedColumnOptions()}
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
                                  {renderGroupedColumnOptions()}
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
                                  {renderGroupedColumnOptions()}
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
                                {renderGroupedColumnOptions()}
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
                                  {renderGroupedColumnOptions()}
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
                                  {renderGroupedColumnOptions()}
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
                                {renderGroupedColumnOptions()}
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

                        {step.type === "conditional" && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">WENN</span>
                              <Select
                                value={(step.config.sourceColumn as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, sourceColumn: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte wählen" />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderGroupedColumnOptions()}
                                </SelectContent>
                              </Select>
                              <Select
                                value={(step.config.condition as string) || "contains"}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, condition: v })}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="contains">enthält</SelectItem>
                                  <SelectItem value="equals">ist gleich</SelectItem>
                                  <SelectItem value="not_contains">enthält nicht</SelectItem>
                                  <SelectItem value="not_equals">ist ungleich</SelectItem>
                                  <SelectItem value="starts_with">beginnt mit</SelectItem>
                                  <SelectItem value="ends_with">endet mit</SelectItem>
                                  <SelectItem value="is_empty">ist leer</SelectItem>
                                  <SelectItem value="is_not_empty">ist nicht leer</SelectItem>
                                </SelectContent>
                              </Select>
                              {!["is_empty", "is_not_empty"].includes((step.config.condition as string) || "") && (
                                <Input
                                  placeholder="Suchwert"
                                  value={(step.config.searchValue as string) || ""}
                                  onChange={(e) => updateStepConfig(step.id, { ...step.config, searchValue: e.target.value })}
                                  className="w-40"
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">DANN setze</span>
                              <Select
                                value={(step.config.targetType as string) || "existing"}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, targetType: v, targetColumn: "" })}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="existing">bestehende Spalte</SelectItem>
                                  <SelectItem value="new">neue Spalte</SelectItem>
                                </SelectContent>
                              </Select>
                              {(step.config.targetType as string) === "new" ? (
                                <Input
                                  placeholder="Neuer Spaltenname"
                                  value={(step.config.targetColumn as string) || ""}
                                  onChange={(e) => updateStepConfig(step.id, { ...step.config, targetColumn: e.target.value })}
                                  className="w-40"
                                />
                              ) : (
                                <Select
                                  value={(step.config.targetColumn as string) || ""}
                                  onValueChange={(v) => updateStepConfig(step.id, { ...step.config, targetColumn: v })}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Zielspalte" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {renderGroupedColumnOptions()}
                                  </SelectContent>
                                </Select>
                              )}
                              <span className="text-sm">auf</span>
                              <Input
                                placeholder="Dann-Wert"
                                value={(step.config.thenValue as string) || ""}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, thenValue: e.target.value })}
                                className="w-40"
                              />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">SONST setze auf</span>
                              <Input
                                placeholder="Sonst-Wert (optional)"
                                value={(step.config.elseValue as string) || ""}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, elseValue: e.target.value })}
                                className="w-40"
                              />
                              <span className="text-xs text-muted-foreground">(leer = Wert beibehalten)</span>
                            </div>
                          </div>
                        )}

                        {step.type === "replace_text" && (
                          <div className="flex gap-2 flex-wrap">
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {renderGroupedColumnOptions()}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Suchen"
                              value={(step.config.searchText as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, searchText: e.target.value })}
                              className="w-32"
                            />
                            <span className="flex items-center text-muted-foreground">→</span>
                            <Input
                              placeholder="Ersetzen"
                              value={(step.config.replaceText as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, replaceText: e.target.value })}
                              className="w-32"
                            />
                          </div>
                        )}

                        {step.type === "extract_substring" && (
                          <div className="flex gap-2 flex-wrap items-center">
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {renderGroupedColumnOptions()}
                              </SelectContent>
                            </Select>
                            <span className="text-sm">von Position</span>
                            <Input
                              type="number"
                              placeholder="0"
                              value={(step.config.startPos as string) || "0"}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, startPos: e.target.value })}
                              className="w-20"
                            />
                            <span className="text-sm">Länge</span>
                            <Input
                              type="number"
                              placeholder="Alle"
                              value={(step.config.length as string) || ""}
                              onChange={(e) => updateStepConfig(step.id, { ...step.config, length: e.target.value })}
                              className="w-20"
                            />
                          </div>
                        )}

                        {step.type === "select_columns" && (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Wählen Sie die Spalten, die behalten werden sollen:</p>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                              {headersWithSource.map((item) => {
                                const selectedColumns = (step.config.columns as string[]) || [];
                                const isSelected = selectedColumns.includes(item.header);
                                return (
                                  <Badge
                                    key={`${item.slotName}-${item.header}`}
                                    variant={isSelected ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => {
                                      const newColumns = isSelected
                                        ? selectedColumns.filter(c => c !== item.header)
                                        : [...selectedColumns, item.header];
                                      updateStepConfig(step.id, { columns: newColumns });
                                    }}
                                  >
                                    <span className="text-xs text-muted-foreground mr-1">[{item.slotName}]</span>
                                    {item.header}
                                    {isSelected && <Check className="ml-1 h-3 w-3" />}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {step.type === "remove_duplicates" && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm">Duplikate entfernen basierend auf</span>
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {renderGroupedColumnOptions()}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {step.type === "sort_rows" && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm">Sortieren nach</span>
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {renderGroupedColumnOptions()}
                              </SelectContent>
                            </Select>
                            <Select
                              value={(step.config.direction as string) || "asc"}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, direction: v })}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="asc">Aufsteigend</SelectItem>
                                <SelectItem value="desc">Absteigend</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {step.type === "concat_files" && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm">Datei anhängen:</span>
                            <Select
                              value={(step.config.file2Slot as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, file2Slot: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Datei wählen" />
                              </SelectTrigger>
                              <SelectContent>
                                {inputFileSlots.filter(s => s.inputType !== 'manual').map((slot) => (
                                  <SelectItem key={slot.id} value={slot.id}>{slot.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {step.type === "calculate" && (
                          <div className="space-y-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <Select
                                value={(step.config.column1 as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column1: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte 1" />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderGroupedColumnOptions()}
                                </SelectContent>
                              </Select>
                              <Select
                                value={(step.config.operator as string) || "add"}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, operator: v })}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="add">+ Addieren</SelectItem>
                                  <SelectItem value="subtract">- Subtrahieren</SelectItem>
                                  <SelectItem value="multiply">× Multiplizieren</SelectItem>
                                  <SelectItem value="divide">÷ Dividieren</SelectItem>
                                  <SelectItem value="abs">|x| Absolutwert</SelectItem>
                                </SelectContent>
                              </Select>
                              {(step.config.operator as string) !== "abs" && (
                                <>
                                  <Select
                                    value={(step.config.column2 as string) || ""}
                                    onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column2: v, value: "" })}
                                  >
                                    <SelectTrigger className="w-40">
                                      <SelectValue placeholder="Spalte 2 / Wert" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {renderGroupedColumnOptions()}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-sm text-muted-foreground">oder</span>
                                  <Input
                                    type="number"
                                    placeholder="Fester Wert"
                                    value={(step.config.value as string) || ""}
                                    onChange={(e) => updateStepConfig(step.id, { ...step.config, value: e.target.value, column2: "" })}
                                    className="w-28"
                                  />
                                </>
                              )}
                            </div>
                            <div className="flex gap-2 items-center">
                              <span className="text-sm">Ergebnis in Spalte:</span>
                              <Input
                                placeholder="Neue Spalte"
                                value={(step.config.resultColumn as string) || ""}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, resultColumn: e.target.value })}
                                className="w-40"
                              />
                            </div>
                          </div>
                        )}

                        {step.type === "debit_credit" && (
                          <div className="space-y-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <span className="text-sm">Betrag aus</span>
                              <Select
                                value={(step.config.amountColumn as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, amountColumn: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte" />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderGroupedColumnOptions()}
                                </SelectContent>
                              </Select>
                              <span className="text-sm">→ Spalte</span>
                              <Input
                                placeholder="SH"
                                value={(step.config.targetColumn as string) || "SH"}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, targetColumn: e.target.value })}
                                className="w-24"
                              />
                            </div>
                            <div className="flex gap-2 items-center">
                              <span className="text-sm">Positiv:</span>
                              <Input
                                placeholder="S"
                                value={(step.config.debitValue as string) || "S"}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, debitValue: e.target.value })}
                                className="w-16"
                              />
                              <span className="text-sm">Negativ:</span>
                              <Input
                                placeholder="H"
                                value={(step.config.creditValue as string) || "H"}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, creditValue: e.target.value })}
                                className="w-16"
                              />
                            </div>
                          </div>
                        )}

                        {step.type === "format_number" && (
                          <div className="space-y-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <Select
                                value={(step.config.column as string) || ""}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Spalte" />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderGroupedColumnOptions()}
                                </SelectContent>
                              </Select>
                              <span className="text-sm">Dezimalzeichen</span>
                              <Select
                                value={(step.config.decimalSeparator as string) || ","}
                                onValueChange={(v) => updateStepConfig(step.id, { ...step.config, decimalSeparator: v })}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value=",">,</SelectItem>
                                  <SelectItem value=".">.</SelectItem>
                                </SelectContent>
                              </Select>
                              <span className="text-sm">Dezimalstellen</span>
                              <Input
                                type="number"
                                value={(step.config.decimals as string) || "2"}
                                onChange={(e) => updateStepConfig(step.id, { ...step.config, decimals: e.target.value })}
                                className="w-16"
                              />
                            </div>
                            <div className="flex gap-2 items-center">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={(step.config.removeSign as boolean) || false}
                                  onChange={(e) => updateStepConfig(step.id, { ...step.config, removeSign: e.target.checked })}
                                />
                                Vorzeichen entfernen (Absolutwert)
                              </label>
                            </div>
                          </div>
                        )}

                        {step.type === "format_date" && (
                          <div className="flex gap-2 items-center flex-wrap">
                            <Select
                              value={(step.config.column as string) || ""}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, column: v })}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Spalte" />
                              </SelectTrigger>
                              <SelectContent>
                                {renderGroupedColumnOptions()}
                              </SelectContent>
                            </Select>
                            <span className="text-sm">Ausgabeformat:</span>
                            <Select
                              value={(step.config.outputFormat as string) || "DDMM"}
                              onValueChange={(v) => updateStepConfig(step.id, { ...step.config, outputFormat: v })}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DDMM">TTMM (z.B. 0115)</SelectItem>
                                <SelectItem value="DDMMYYYY">TTMMJJJJ (z.B. 01152024)</SelectItem>
                              </SelectContent>
                            </Select>
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
        )}

        {hasAnyFileSlot && uploadedFiles.length > 0 && transformationSteps.length > 0 && transformedPreview && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                Transformierte Vorschau
              </CardTitle>
              <CardDescription>
                Vorschau von Datei 1 nach {transformationSteps.length} Transformationsschritt{transformationSteps.length !== 1 ? "en" : ""}
                {uploadedFiles.length > 1 && " (Dateien-Matching wird bei Ausführung angewendet)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full border-collapse text-sm min-w-max" data-testid="table-transformed-preview">
                  <thead>
                    <tr className="bg-primary/10">
                      {transformedPreview.headers.map((header, i) => (
                        <th key={i} className="border-b border-r last:border-r-0 border-border px-3 py-2 text-left font-medium whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transformedPreview.rows.length > 0 ? (
                      transformedPreview.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-muted/50">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="border-b border-r last:border-r-0 border-border px-3 py-2 whitespace-nowrap">
                              {cell || <span className="text-muted-foreground italic">leer</span>}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={transformedPreview.headers.length} className="text-center py-4 text-muted-foreground">
                          Keine Zeilen nach Filterung übrig
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {transformedPreview.headers.length} Spalten, {transformedPreview.rows.length} Vorschauzeilen
              </p>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
