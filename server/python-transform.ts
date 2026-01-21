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
