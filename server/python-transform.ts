import FormData from "form-data";
import fetch from "node-fetch";

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:5001";

interface TransformResult {
  success: boolean;
  columns: string[];
  row_count: number;
  data: Array<Record<string, any>>;
  csv_content: string;
}

interface OutputFileResult {
  name: string;
  format: string;
  content?: string;
  content_type?: string;
  row_count?: number;
  columns?: string[];
  data?: Array<Record<string, any>>;
  success: boolean;
  error?: string;
}

interface ExecuteCodeResult {
  success: boolean;
  outputs: OutputFileResult[];
  error?: string;
}

export interface OutputFileConfig {
  id: string;
  name: string;
  dataFrameVariable: string;
  format: string;
}

export interface TemplateFileData {
  name: string;
  content_base64: string;
}

export async function executePythonCode(
  files: Array<{ variable: string; content: Buffer; filename: string }>,
  pythonCode: string,
  outputFiles: OutputFileConfig[],
  templateFiles?: TemplateFileData[]
): Promise<ExecuteCodeResult> {
  const formData = new FormData();
  
  // Create slot mapping: index -> variable name
  const slotMapping: Record<string, string> = {};
  files.forEach((file, index) => {
    formData.append("files", file.content, {
      filename: file.filename,
      contentType: getContentType(file.filename),
    });
    slotMapping[String(index)] = file.variable;
  });
  
  formData.append("slot_mapping", JSON.stringify(slotMapping));
  formData.append("python_code", pythonCode);
  formData.append("output_files", JSON.stringify(outputFiles));
  
  // Add template files if provided
  if (templateFiles && templateFiles.length > 0) {
    formData.append("template_files", JSON.stringify(templateFiles));
  }
  
  const response = await fetch(`${PYTHON_SERVICE_URL}/execute-code`, {
    method: "POST",
    body: formData,
    headers: formData.getHeaders(),
  });
  
  const result = await response.json() as ExecuteCodeResult;
  
  if (!response.ok) {
    throw new Error(result.error || `Python service error: ${response.status}`);
  }
  
  return result;
}

export async function callPythonTransform(
  files: Array<{ slotId: string; content: Buffer; filename: string }>,
  transformationSteps: any[]
): Promise<TransformResult> {
  const formData = new FormData();
  
  const fileSlots: Record<string, number> = {};
  files.forEach((file, index) => {
    formData.append("files", file.content, {
      filename: file.filename,
      contentType: getContentType(file.filename),
    });
    fileSlots[file.slotId] = index;
  });
  
  formData.append("file_slots", JSON.stringify(fileSlots));
  formData.append("transformation_steps", JSON.stringify(transformationSteps));
  
  const response = await fetch(`${PYTHON_SERVICE_URL}/transform`, {
    method: "POST",
    body: formData,
    headers: formData.getHeaders(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Python service error: ${response.status} - ${errorText}`);
  }
  
  return await response.json() as TransformResult;
}

export async function checkPythonServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/health`, {
      method: "GET",
      timeout: 2000,
    } as any);
    return response.ok;
  } catch {
    return false;
  }
}

function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}
