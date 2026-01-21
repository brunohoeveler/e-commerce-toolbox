import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes, ObjectStorageService, objectStorageClient } from "./replit_integrations/object_storage";
import { 
  insertMandantSchema, 
  insertProcessSchema, 
  insertProcessExecutionSchema,
  insertExportRecordSchema 
} from "@shared/schema";
import { z } from "zod";
import { callPythonTransform, checkPythonServiceHealth } from "./python-transform";

interface AuthRequest extends Request {
  user?: {
    claims: {
      sub: string;
    };
  };
}

async function getUserContext(userId: string) {
  let profile = await storage.getUserProfile(userId);
  
  if (!profile) {
    const allUsers = await storage.getUsers();
    const allProfiles = allUsers.filter(u => u.profile).map(u => u.profile);
    const hasAnyInternalUser = allProfiles.some(p => p?.role === "internal");
    
    if (!hasAnyInternalUser) {
      profile = await storage.createUserProfile({ userId, role: "internal" });
    } else {
      profile = await storage.createUserProfile({ userId, role: "external" });
    }
  }
  
  const isInternal = profile?.role === "internal";
  const assignments = isInternal ? [] : await storage.getUserMandantAssignments(userId);
  const assignedMandantIds = assignments.map(a => a.mandantId);
  
  return { isInternal, assignedMandantIds, profile };
}

async function canAccessMandant(userId: string, mandantId: string): Promise<boolean> {
  const { isInternal, assignedMandantIds } = await getUserContext(userId);
  if (isInternal) return true;
  return assignedMandantIds.includes(mandantId);
}

function isInternalOnly(req: AuthRequest, res: Response, next: NextFunction) {
  const userId = req.user?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  storage.getUserProfile(userId).then(profile => {
    if (profile?.role !== "internal") {
      return res.status(403).json({ message: "Access denied. Internal users only." });
    }
    next();
  }).catch(() => {
    res.status(500).json({ message: "Authorization error" });
  });
}

async function requireMandantAccess(req: AuthRequest, res: Response, mandantId: string): Promise<boolean> {
  const userId = req.user?.claims?.sub;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  
  const hasAccess = await canAccessMandant(userId, mandantId);
  if (!hasAccess) {
    res.status(403).json({ message: "Access denied. You are not assigned to this mandant." });
    return false;
  }
  return true;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  app.get("/api/mandanten", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { isInternal } = await getUserContext(userId);
      const mandanten = await storage.getMandantenForUser(userId, isInternal);
      res.json(mandanten);
    } catch (error) {
      console.error("Error fetching mandanten:", error);
      res.status(500).json({ message: "Failed to fetch mandanten" });
    }
  });

  app.get("/api/mandanten/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.params.id;
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const mandant = await storage.getMandant(mandantId);
      if (!mandant) {
        return res.status(404).json({ message: "Mandant not found" });
      }
      res.json(mandant);
    } catch (error) {
      console.error("Error fetching mandant:", error);
      res.status(500).json({ message: "Failed to fetch mandant" });
    }
  });

  app.post("/api/mandanten", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const data = insertMandantSchema.parse(req.body);
      const mandant = await storage.createMandant(data);
      res.status(201).json(mandant);
    } catch (error) {
      console.error("Error creating mandant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create mandant" });
    }
  });

  app.patch("/api/mandanten/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.params.id;
      
      const { isInternal } = await getUserContext(userId);
      if (!isInternal) {
        return res.status(403).json({ message: "Access denied. Only internal users can modify mandanten." });
      }
      
      const data = insertMandantSchema.partial().parse(req.body);
      const mandant = await storage.updateMandant(mandantId, data);
      if (!mandant) {
        return res.status(404).json({ message: "Mandant not found" });
      }
      res.json(mandant);
    } catch (error) {
      console.error("Error updating mandant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update mandant" });
    }
  });

  app.delete("/api/mandanten/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      await storage.deleteMandant(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting mandant:", error);
      res.status(500).json({ message: "Failed to delete mandant" });
    }
  });

  app.get("/api/mandanten/:id/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.params.id;
      
      const { isInternal } = await getUserContext(userId);
      if (!isInternal) {
        return res.status(403).json({ message: "Access denied. Only internal users can view user assignments." });
      }
      
      const assignments = await storage.getMandantUserAssignments(mandantId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching mandant users:", error);
      res.status(500).json({ message: "Failed to fetch mandant users" });
    }
  });

  app.post("/api/mandanten/:id/users", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const { email } = req.body;
      const users = await storage.getUsers();
      const user = users.find(u => u.email === email);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const assignment = await storage.createMandantUserAssignment({
        mandantId: req.params.id,
        userId: user.id,
      });
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error assigning user:", error);
      res.status(500).json({ message: "Failed to assign user" });
    }
  });

  app.delete("/api/mandanten/:mandantId/users/:userId", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      await storage.deleteMandantUserAssignment(req.params.mandantId, req.params.userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing user assignment:", error);
      res.status(500).json({ message: "Failed to remove user assignment" });
    }
  });

  app.get("/api/processes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.query.mandantId as string;
      
      if (!mandantId) {
        return res.status(400).json({ message: "mandantId required" });
      }
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const procs = await storage.getProcesses(mandantId);
      res.json(procs);
    } catch (error) {
      console.error("Error fetching processes:", error);
      res.status(500).json({ message: "Failed to fetch processes" });
    }
  });

  app.get("/api/processes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const process = await storage.getProcess(req.params.id);
      
      if (!process) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, process.mandantId))) return;
      
      res.json(process);
    } catch (error) {
      console.error("Error fetching process:", error);
      res.status(500).json({ message: "Failed to fetch process" });
    }
  });

  app.post("/api/processes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const data = insertProcessSchema.parse(req.body);
      
      if (!(await requireMandantAccess(req, res, data.mandantId))) return;
      
      const process = await storage.createProcess(data);
      res.status(201).json(process);
    } catch (error) {
      console.error("Error creating process:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create process" });
    }
  });

  app.patch("/api/processes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existingProcess = await storage.getProcess(req.params.id);
      
      if (!existingProcess) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, existingProcess.mandantId))) return;
      
      const data = insertProcessSchema.partial().parse(req.body);
      const process = await storage.updateProcess(req.params.id, data);
      res.json(process);
    } catch (error) {
      console.error("Error updating process:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update process" });
    }
  });

  app.delete("/api/processes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existingProcess = await storage.getProcess(req.params.id);
      
      if (!existingProcess) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, existingProcess.mandantId))) return;
      
      await storage.deleteProcess(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting process:", error);
      res.status(500).json({ message: "Failed to delete process" });
    }
  });

  app.post("/api/processes/:id/execute", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const process = await storage.getProcess(req.params.id);
      
      if (!process) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, process.mandantId))) return;

      const { month, year, inputFiles } = req.body;
      
      let transformedData: TransactionData;
      
      const isPythonServiceAvailable = await checkPythonServiceHealth();
      
      if (isPythonServiceAvailable && inputFiles && inputFiles.length > 0) {
        try {
          const objectStorageService = new ObjectStorageService();
          const filesForPython: Array<{ slotId: string; content: Buffer; filename: string }> = [];
          
          for (const fileInfo of inputFiles) {
            if (fileInfo.objectPath) {
              const file = await objectStorageService.getObjectEntityFile(fileInfo.objectPath);
              const [content] = await file.download();
              filesForPython.push({
                slotId: fileInfo.slotId || `file_${filesForPython.length}`,
                content: content,
                filename: fileInfo.filename || fileInfo.name || 'file.csv',
              });
            } else if (fileInfo.content) {
              filesForPython.push({
                slotId: fileInfo.slotId || `file_${filesForPython.length}`,
                content: Buffer.from(fileInfo.content, 'utf-8'),
                filename: fileInfo.filename || fileInfo.name || 'file.csv',
              });
            }
          }
          
          if (filesForPython.length > 0) {
            const pythonResult = await callPythonTransform(
              filesForPython,
              process.transformationSteps as any[] || []
            );
            
            const amountColumn = pythonResult.columns.find((col: string) => 
              col.toLowerCase().includes('betrag') || 
              col.toLowerCase().includes('amount') || 
              col.toLowerCase().includes('summe')
            );
            const totalAmount = amountColumn 
              ? pythonResult.data.reduce((sum: number, t: any) => sum + (parseFloat(t[amountColumn]) || 0), 0)
              : 0;
            
            transformedData = {
              transactions: pythonResult.data,
              columns: pythonResult.columns,
              summary: {
                totalAmount,
                transactionCount: pythonResult.row_count,
              },
            };
          } else {
            transformedData = executeTransformationPipeline(inputFiles || [], process.transformationSteps as any[] || []);
          }
        } catch (pythonError) {
          console.error("Python service error, falling back to JS:", pythonError);
          transformedData = executeTransformationPipeline(inputFiles || [], process.transformationSteps as any[] || []);
        }
      } else {
        transformedData = executeTransformationPipeline(inputFiles || [], process.transformationSteps as any[] || []);
      }
      
      const execution = await storage.createProcessExecution({
        processId: process.id,
        mandantId: process.mandantId,
        status: "completed",
        month: month || new Date().getMonth() + 1,
        year: year || new Date().getFullYear(),
        inputFiles: inputFiles || [],
        outputData: transformedData,
        transactionCount: transformedData.transactions?.length || 0,
      });

      res.status(201).json(execution);
    } catch (error) {
      console.error("Error executing process:", error);
      res.status(500).json({ message: "Failed to execute process" });
    }
  });

  app.get("/api/process-executions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { mandantId, month, year } = req.query;
      
      if (!mandantId) {
        return res.status(400).json({ message: "mandantId required" });
      }
      
      if (!(await requireMandantAccess(req, res, mandantId as string))) return;
      
      const executions = await storage.getProcessExecutions(
        mandantId as string,
        month ? parseInt(month as string) : undefined,
        year ? parseInt(year as string) : undefined
      );
      res.json(executions);
    } catch (error) {
      console.error("Error fetching executions:", error);
      res.status(500).json({ message: "Failed to fetch executions" });
    }
  });

  app.get("/api/process-executions/completed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.query.mandantId as string;
      
      if (!mandantId) {
        return res.status(400).json({ message: "mandantId required" });
      }
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const executions = await storage.getCompletedProcessExecutions(mandantId);
      res.json(executions);
    } catch (error) {
      console.error("Error fetching completed executions:", error);
      res.status(500).json({ message: "Failed to fetch executions" });
    }
  });

  app.get("/api/process-executions/recent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.query.mandantId as string;
      
      if (!mandantId) {
        return res.status(400).json({ message: "mandantId required" });
      }
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const executions = await storage.getRecentProcessExecutions(mandantId);
      res.json(executions);
    } catch (error) {
      console.error("Error fetching recent executions:", error);
      res.status(500).json({ message: "Failed to fetch executions" });
    }
  });

  app.get("/api/exports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mandantId = req.query.mandantId as string;
      
      if (!mandantId) {
        return res.status(400).json({ message: "mandantId required" });
      }
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const exports = await storage.getExportRecords(mandantId);
      res.json(exports);
    } catch (error) {
      console.error("Error fetching exports:", error);
      res.status(500).json({ message: "Failed to fetch exports" });
    }
  });

  app.post("/api/exports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { processExecutionId, format, mandantId } = req.body;
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const execution = await storage.getProcessExecution(processExecutionId);
      if (!execution) {
        return res.status(404).json({ message: "Process execution not found" });
      }
      
      if (execution.mandantId !== mandantId) {
        return res.status(403).json({ message: "Execution does not belong to this mandant" });
      }

      const mandant = await storage.getMandant(mandantId);
      const exportData = generateExportData(execution, format, mandant);

      const exportRecord = await storage.createExportRecord({
        mandantId,
        processExecutionId,
        name: `Export_${format.toUpperCase()}_${new Date().toISOString().split('T')[0]}`,
        format,
        exportData,
      });

      res.status(201).json({
        ...exportRecord,
        downloadUrl: `/api/exports/${exportRecord.id}/download`,
      });
    } catch (error) {
      console.error("Error creating export:", error);
      res.status(500).json({ message: "Failed to create export" });
    }
  });

  app.get("/api/exports/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const exportRecord = await storage.getExportRecord(req.params.id);
      
      if (!exportRecord) {
        return res.status(404).json({ message: "Export not found" });
      }
      
      if (!(await requireMandantAccess(req, res, exportRecord.mandantId))) return;
      
      const filename = `${exportRecord.name}.${exportRecord.format === 'datev' ? 'csv' : 'txt'}`;
      const content = formatExportContent(exportRecord.exportData, exportRecord.format);
      
      res.setHeader("Content-Type", exportRecord.format === 'datev' ? "text/csv" : "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      console.error("Error downloading export:", error);
      res.status(500).json({ message: "Failed to download export" });
    }
  });

  app.get("/api/users", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const { role } = req.body;
      const userId = req.params.id;
      
      let profile = await storage.getUserProfile(userId);
      
      if (!profile) {
        profile = await storage.createUserProfile({ userId, role });
      } else {
        profile = await storage.updateUserProfile(userId, { role });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  return httpServer;
}

interface TransformationStep {
  id: string;
  type: string;
  config: Record<string, any>;
}

interface TransactionData {
  transactions: Array<Record<string, any>>;
  columns: string[];
  summary: {
    totalAmount: number;
    transactionCount: number;
  };
}

function executeTransformationPipeline(inputFiles: any[], steps: TransformationStep[]): TransactionData {
  let transactions: Array<Record<string, any>> = parseInputFiles(inputFiles);
  let columns = transactions.length > 0 
    ? Object.keys(transactions[0]) 
    : ['datum', 'betrag', 'waehrung', 'beschreibung', 'referenz', 'typ', 'konto'];
  
  for (const step of steps) {
    const result = applyTransformationStep(transactions, columns, step);
    transactions = result.transactions;
    columns = result.columns;
  }
  
  const totalAmount = transactions.reduce((sum, t) => sum + (parseFloat(t.betrag) || 0), 0);
  
  return {
    transactions,
    columns,
    summary: {
      totalAmount,
      transactionCount: transactions.length,
    },
  };
}

function parseInputFiles(inputFiles: any[]): Array<Record<string, any>> {
  const transactions: Array<Record<string, any>> = [];
  
  for (const file of inputFiles) {
    if (file.data && Array.isArray(file.data)) {
      transactions.push(...file.data);
    } else if (file.content && typeof file.content === 'string') {
      const parsed = parseCSVContent(file.content);
      transactions.push(...parsed);
    }
  }
  
  if (transactions.length === 0) {
    return generateSampleTransactions();
  }
  
  return transactions;
}

function parseCSVContent(content: string): Array<Record<string, any>> {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = parseCSVLine(headerLine, delimiter);
  
  const transactions: Array<Record<string, any>> = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line, delimiter);
    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      const key = header.toLowerCase().replace(/\s+/g, '_');
      row[key] = values[idx] || '';
    });
    transactions.push(row);
  }
  
  return transactions;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function generateSampleTransactions(): Array<Record<string, any>> {
  const types = ['Zahlung', 'Erstattung', 'Gebühr', 'Überweisung'];
  const transactions = [];
  const count = Math.floor(Math.random() * 50) + 20;
  
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    
    transactions.push({
      datum: date.toLocaleDateString('de-DE'),
      betrag: (Math.random() * 500 + 10).toFixed(2),
      waehrung: 'EUR',
      beschreibung: `Transaktion ${i + 1}`,
      referenz: `REF-${Date.now()}-${i}`,
      typ: types[Math.floor(Math.random() * types.length)],
      konto: ['PayPal', 'Stripe', 'Bank'][Math.floor(Math.random() * 3)],
    });
  }
  
  return transactions;
}

function applyTransformationStep(
  transactions: Array<Record<string, any>>,
  columns: string[],
  step: TransformationStep
): { transactions: Array<Record<string, any>>; columns: string[] } {
  switch (step.type) {
    case 'removeColumn': {
      const columnToRemove = step.config.columnName;
      const newColumns = columns.filter(c => c !== columnToRemove);
      const newTransactions = transactions.map(t => {
        const { [columnToRemove]: removed, ...rest } = t;
        return rest;
      });
      return { transactions: newTransactions, columns: newColumns };
    }
    
    case 'addColumn': {
      const newColumn = step.config.columnName;
      const defaultValue = step.config.defaultValue || '';
      const newColumns = [...columns, newColumn];
      const newTransactions = transactions.map(t => ({
        ...t,
        [newColumn]: defaultValue,
      }));
      return { transactions: newTransactions, columns: newColumns };
    }
    
    case 'renameColumn': {
      const oldName = step.config.oldName;
      const newName = step.config.newName;
      const newColumns = columns.map(c => c === oldName ? newName : c);
      const newTransactions = transactions.map(t => {
        const { [oldName]: value, ...rest } = t;
        return { ...rest, [newName]: value };
      });
      return { transactions: newTransactions, columns: newColumns };
    }
    
    case 'mergeColumns': {
      const col1 = step.config.column1;
      const col2 = step.config.column2;
      const newColumn = step.config.newColumn || `${col1}_${col2}`;
      const separator = step.config.separator || ' ';
      const newColumns = columns.filter(c => c !== col1 && c !== col2);
      newColumns.push(newColumn);
      const newTransactions = transactions.map(t => {
        const { [col1]: v1, [col2]: v2, ...rest } = t;
        return { ...rest, [newColumn]: `${v1 || ''}${separator}${v2 || ''}` };
      });
      return { transactions: newTransactions, columns: newColumns };
    }
    
    case 'splitColumn': {
      const sourceCol = step.config.sourceColumn;
      const separator = step.config.separator || ' ';
      const col1Name = step.config.newColumn1 || `${sourceCol}_1`;
      const col2Name = step.config.newColumn2 || `${sourceCol}_2`;
      const newColumns = columns.filter(c => c !== sourceCol);
      newColumns.push(col1Name, col2Name);
      const newTransactions = transactions.map(t => {
        const { [sourceCol]: value, ...rest } = t;
        const parts = String(value || '').split(separator);
        return { ...rest, [col1Name]: parts[0] || '', [col2Name]: parts.slice(1).join(separator) || '' };
      });
      return { transactions: newTransactions, columns: newColumns };
    }
    
    case 'filterRows': {
      const column = step.config.column;
      const operator = step.config.operator;
      const value = step.config.value;
      const newTransactions = transactions.filter(t => {
        const cellValue = t[column];
        switch (operator) {
          case 'equals': return cellValue == value;
          case 'notEquals': return cellValue != value;
          case 'contains': return String(cellValue).includes(value);
          case 'greaterThan': return parseFloat(cellValue) > parseFloat(value);
          case 'lessThan': return parseFloat(cellValue) < parseFloat(value);
          default: return true;
        }
      });
      return { transactions: newTransactions, columns };
    }
    
    case 'removeString': {
      const column = step.config.column;
      const stringToRemove = step.config.stringToRemove;
      const newTransactions = transactions.map(t => ({
        ...t,
        [column]: String(t[column] || '').replace(new RegExp(stringToRemove, 'g'), ''),
      }));
      return { transactions: newTransactions, columns };
    }
    
    case 'matchFiles': {
      return { transactions, columns };
    }
    
    default:
      return { transactions, columns };
  }
}

function generateExportData(execution: any, format: string, mandant: any): any {
  const data = execution.outputData as TransactionData;
  const transactions = data?.transactions || [];
  
  if (format === 'datev') {
    return generateDatevExport(transactions, mandant);
  } else {
    return generateAsciiExport(transactions, mandant);
  }
}

function generateDatevExport(transactions: Array<Record<string, any>>, mandant: any): any {
  const beraterNr = mandant?.beraterNummer || '12345';
  const mandantNr = mandant?.mandantenNummer || '67890';
  const sachkontenLaenge = mandant?.sachkontenLaenge || 4;
  
  const header = {
    formatVersion: 'EXTF',
    version: 700,
    dataCategory: 21,
    formatName: 'Buchungsstapel',
    beraterNummer: beraterNr,
    mandantenNummer: mandantNr,
    geschaeftsjahr: new Date().getFullYear(),
    sachkontenLaenge,
  };
  
  const buchungen = transactions.map((t, idx) => ({
    umsatz: parseFloat(t.betrag) || 0,
    sollHabenKennzeichen: parseFloat(t.betrag) >= 0 ? 'S' : 'H',
    kontonummer: calculateKonto(t.typ, sachkontenLaenge),
    gegenkontonummer: calculateGegenkonto(t.typ, sachkontenLaenge),
    belegdatum: t.datum,
    buchungstext: t.beschreibung?.substring(0, 60) || '',
    belegfeld1: t.referenz || '',
  }));
  
  return { header, buchungen };
}

function generateAsciiExport(transactions: Array<Record<string, any>>, mandant: any): any {
  const lines = transactions.map(t => ({
    datum: t.datum,
    betrag: parseFloat(t.betrag) || 0,
    text: t.beschreibung || '',
    konto: calculateKonto(t.typ, 4),
    gegenkonto: calculateGegenkonto(t.typ, 4),
  }));
  
  return { lines, format: 'ASCII', delimiter: ';' };
}

function calculateKonto(typ: string, length: number): string {
  const konten: Record<string, string> = {
    'Zahlung': '8400',
    'Erstattung': '8401',
    'Gebühr': '6855',
    'Überweisung': '1200',
  };
  const konto = konten[typ] || '8400';
  return konto.padStart(length, '0');
}

function calculateGegenkonto(typ: string, length: number): string {
  const gegenkonten: Record<string, string> = {
    'Zahlung': '1200',
    'Erstattung': '1200',
    'Gebühr': '1800',
    'Überweisung': '1800',
  };
  const gegenkonto = gegenkonten[typ] || '1200';
  return gegenkonto.padStart(length, '0');
}

function formatExportContent(exportData: any, format: string): string {
  if (format === 'datev') {
    const { header, buchungen } = exportData;
    const now = new Date();
    const dateCreated = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}000`;
    const fiscalYearStart = `${header.geschaeftsjahr}0101`;
    const fiscalYearEnd = `${header.geschaeftsjahr}1231`;
    
    const headerLine = [
      '"EXTF"', '700', '21', '"Buchungsstapel"', '"RECP"', '""',
      `"${header.beraterNummer}"`, `"${header.mandantenNummer}"`,
      `${fiscalYearStart}`, `${header.sachkontenLaenge}`,
      `${dateCreated}`, '""', '""', '""', '""', '""', '""',
      `${fiscalYearStart}`, `${fiscalYearEnd}`, '""', '""', '""', '""',
      '"EUR"', '""', '""', '""'
    ].join(';');
    
    const columnHeader = '"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"';
    
    const dataLines = buchungen.map((b: any) => {
      const betrag = Math.abs(b.umsatz).toFixed(2).replace('.', ',');
      const belegdatum = formatDatevDate(b.belegdatum);
      return [
        betrag, `"${b.sollHabenKennzeichen}"`, '"EUR"', '""', '""', '""',
        `"${b.kontonummer}"`, `"${b.gegenkontonummer}"`, '""',
        `"${belegdatum}"`, `"${b.belegfeld1}"`, '""', '""', `"${b.buchungstext}"`
      ].join(';');
    });
    
    return [headerLine, columnHeader, ...dataLines].join('\r\n');
  } else {
    const { lines, delimiter } = exportData;
    const headerLine = `Datum${delimiter}Betrag${delimiter}Text${delimiter}Konto${delimiter}Gegenkonto`;
    const dataLines = lines.map((l: any) => 
      `${l.datum}${delimiter}${l.betrag.toFixed(2).replace('.', ',')}${delimiter}${l.text}${delimiter}${l.konto}${delimiter}${l.gegenkonto}`
    );
    return [headerLine, ...dataLines].join('\r\n');
  }
}

function formatDatevDate(dateStr: string): string {
  if (!dateStr) return '';
  
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    const [day, month] = parts;
    return `${day.padStart(2, '0')}${month.padStart(2, '0')}`;
  }
  
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  
  return dateStr;
}
