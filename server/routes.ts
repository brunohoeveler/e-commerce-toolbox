import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated, AuthRequest } from "./lib/auth-middleware";
import { registerObjectStorageRoutes, ObjectStorageService, objectStorageClient } from "./replit_integrations/object_storage";
import { 
  insertMandantSchema, 
  insertProcessSchema, 
  insertProcessExecutionSchema,
  insertExportRecordSchema,
  insertMacroSchema,
  type InputFileSlot,
  type OutputFile
} from "@shared/schema";
import { z } from "zod";
import { callPythonTransform, checkPythonServiceHealth, executePythonCode, TemplateFileData, TimePeriodInfo } from "./python-transform";
import multer from "multer";

// Helper to check if role has internal/admin privileges
function hasInternalAccess(role: string | undefined | null): boolean {
  return role === "internal" || role === "admin";
}

async function getUserContext(userId: string) {
  let profile = await storage.getUserProfile(userId);
  
  if (!profile) {
    const allUsers = await storage.getUsers();
    const allProfiles = allUsers.filter(u => u.profile).map(u => u.profile);
    const hasAnyInternalUser = allProfiles.some(p => hasInternalAccess(p?.role));
    
    if (!hasAnyInternalUser) {
      profile = await storage.createUserProfile({ userId, role: "internal" });
    } else {
      profile = await storage.createUserProfile({ userId, role: "external" });
    }
  }
  
  const isInternal = hasInternalAccess(profile?.role);
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
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  storage.getUserProfile(userId).then(profile => {
    if (!hasInternalAccess(profile?.role)) {
      return res.status(403).json({ message: "Access denied. Internal users only." });
    }
    next();
  }).catch(() => {
    res.status(500).json({ message: "Authorization error" });
  });
}

async function requireMandantAccess(req: AuthRequest, res: Response, mandantId: string): Promise<boolean> {
  const userId = req.user?.id;
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

function stripApiSecrets(mandant: any) {
  if (!mandant) return mandant;
  const result = { ...mandant };
  if (Array.isArray(result.apiConnections)) {
    result.apiConnections = result.apiConnections.map((conn: any) => ({
      ...conn,
      apiKey: conn.apiKey ? conn.apiKey.substring(0, 4) + "****" : undefined,
      apiSecret: conn.apiSecret ? "****" : undefined,
      accessToken: conn.accessToken ? "****" : undefined,
    }));
  }
  return result;
}

function stripApiSecretsArray(mandanten: any[]) {
  return mandanten.map(stripApiSecrets);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerObjectStorageRoutes(app);
  
  // Get current user with profile info for the app
  app.get("/api/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      // getUserContext creates a profile if it doesn't exist
      const { profile } = await getUserContext(userId);
      res.json({
        ...req.user,
        profile,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/mandanten", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const { isInternal } = await getUserContext(userId);
      const mandanten = await storage.getMandantenForUser(userId, isInternal);
      res.json(stripApiSecretsArray(mandanten));
    } catch (error) {
      console.error("Error fetching mandanten:", error);
      res.status(500).json({ message: "Failed to fetch mandanten" });
    }
  });

  app.get("/api/mandanten/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const mandantId = req.params.id;
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const mandant = await storage.getMandant(mandantId);
      if (!mandant) {
        return res.status(404).json({ message: "Mandant not found" });
      }
      res.json(stripApiSecrets(mandant));
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
      const userId = req.user!.id;
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
      const userId = req.user!.id;
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
      const userId = req.user!.id;
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
      const userId = req.user!.id;
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

  app.post("/api/processes", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      console.log("POST /api/processes - req.body:", JSON.stringify(req.body, null, 2));
      console.log("POST /api/processes - transformationSteps:", JSON.stringify(req.body.transformationSteps, null, 2));
      const data = insertProcessSchema.parse(req.body);
      console.log("POST /api/processes - parsed data:", JSON.stringify(data, null, 2));
      
      if (!(await requireMandantAccess(req, res, data.mandantId))) return;
      
      // Validate usedMacroIds - only allow valid macro references
      const usedMacroIds = (data as any).usedMacroIds as string[] || [];
      if (usedMacroIds.length > 0) {
        const userProfile = await storage.getUserProfile(userId);
        const isInternalUser = hasInternalAccess(userProfile?.role);
        
        // External users cannot reference macros (macros are internal-only)
        if (!isInternalUser && usedMacroIds.length > 0) {
          return res.status(403).json({ 
            message: "Nur interne Benutzer können Macros verwenden" 
          });
        }
        
        // Validate that all referenced macros exist
        for (const macroId of usedMacroIds) {
          const macro = await storage.getMacro(macroId);
          if (!macro) {
            return res.status(400).json({ 
              message: `Macro "${macroId}" nicht gefunden` 
            });
          }
        }
      }
      
      const process = await storage.createProcess(data);
      console.log("POST /api/processes - saved process:", JSON.stringify(process, null, 2));
      res.status(201).json(process);
    } catch (error) {
      console.error("Error creating process:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create process" });
    }
  });

  app.patch("/api/processes/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      console.log("PATCH /api/processes - req.body:", JSON.stringify(req.body, null, 2));
      console.log("PATCH /api/processes - transformationSteps:", JSON.stringify(req.body.transformationSteps, null, 2));
      const existingProcess = await storage.getProcess(req.params.id);
      
      if (!existingProcess) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, existingProcess.mandantId))) return;
      
      const data = insertProcessSchema.partial().parse(req.body);
      console.log("PATCH /api/processes - parsed data:", JSON.stringify(data, null, 2));
      
      // Validate usedMacroIds if being updated
      const usedMacroIds = (data as any).usedMacroIds as string[] | undefined;
      if (usedMacroIds && usedMacroIds.length > 0) {
        const userProfile = await storage.getUserProfile(userId);
        const isInternalUser = hasInternalAccess(userProfile?.role);
        
        // External users cannot reference macros (macros are internal-only)
        if (!isInternalUser) {
          return res.status(403).json({ 
            message: "Nur interne Benutzer können Macros verwenden" 
          });
        }
        
        // Validate that all referenced macros exist
        for (const macroId of usedMacroIds) {
          const macro = await storage.getMacro(macroId);
          if (!macro) {
            return res.status(400).json({ 
              message: `Macro "${macroId}" nicht gefunden` 
            });
          }
        }
      }
      
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

  app.delete("/api/processes/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const userId = req.user!.id;
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

  // Configure multer for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  app.post("/api/processes/:id/execute", isAuthenticated, upload.any(), async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const processData = await storage.getProcess(req.params.id);
      
      if (!processData) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, processData.mandantId))) return;

      // Parse time period from form data (shared between both modes)
      const year = parseInt(req.body.year) || new Date().getFullYear();
      const month = req.body.month ? parseInt(req.body.month) : undefined;
      const quarter = req.body.quarter ? parseInt(req.body.quarter) : undefined;

      // Check if this is a "beleg" mode execution
      const inputMode = req.body.inputMode || (processData as any).inputMode || "daten";
      
      if (inputMode === "beleg") {
        const uploadedBelegFiles = req.files as Express.Multer.File[];
        
        let manualAmounts: Array<{ fieldId: string; label: string; value: string }> = [];
        if (req.body.manualAmounts) {
          try {
            manualAmounts = JSON.parse(req.body.manualAmounts);
          } catch (e) {
            console.error("Error parsing manualAmounts:", e);
          }
        }

        const totalAmount = manualAmounts.reduce((sum, amt) => {
          const val = parseFloat(amt.value.replace(/\./g, '').replace(',', '.')) || 0;
          return sum + val;
        }, 0).toFixed(2);

        const execution = await storage.createProcessExecution({
          processId: processData.id,
          mandantId: processData.mandantId,
          status: "completed",
          month: month || null,
          quarter: quarter || null,
          year,
          inputFiles: [],
          attachments: [],
          transactionCount: 0,
          totalAmount,
          manualAmounts: manualAmounts,
        });

        const attachments: Array<{ slotId: string; slotLabel: string; fileName: string; storagePath: string }> = [];
        
        if (uploadedBelegFiles && uploadedBelegFiles.length > 0) {
          const belegFileSlots = ((processData as any).belegFileSlots || []) as Array<{ id: string; label: string }>;
          
          for (const file of uploadedBelegFiles) {
            const slotId = file.fieldname.replace('beleg_', '');
            const slot = belegFileSlots.find((s: any) => s.id === slotId);
            const slotLabel = slot?.label || `Beleg ${slotId}`;
            
            try {
              const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
              if (bucketId) {
                const storagePath = `executions/${execution.id}/${file.originalname}`;
                const bucket = objectStorageClient.bucket(bucketId);
                const fileObj = bucket.file(storagePath);
                await fileObj.save(file.buffer);
                
                attachments.push({
                  slotId,
                  slotLabel,
                  fileName: file.originalname,
                  storagePath: `/${bucketId}/${storagePath}`,
                });
              }
            } catch (uploadError) {
              console.error("Error uploading beleg file:", uploadError);
            }
          }
        }

        if (attachments.length > 0) {
          await storage.updateProcessExecution(execution.id, { attachments });
        }

        return res.json({
          success: true,
          totalAmount,
          executionId: execution.id,
        });
      }

      // === "daten" mode: Python transformation ===

      // Security check: External users cannot execute processes with macros
      const usedMacroIds = (processData as any).usedMacroIds as string[] || [];
      if (usedMacroIds.length > 0) {
        const userProfile = await storage.getUserProfile(userId);
        const isInternalUser = hasInternalAccess(userProfile?.role);
        
        if (!isInternalUser) {
          return res.status(403).json({ 
            success: false,
            error: "Dieser Prozess enthält interne Macros und kann nur von internen Benutzern ausgeführt werden." 
          });
        }
      }

      // Get uploaded files from multer
      const uploadedFiles = req.files as Express.Multer.File[];
      
      // Parse slot mapping from form data
      let slotMapping: Record<string, string> = {};
      if (req.body.slotMapping) {
        try {
          slotMapping = JSON.parse(req.body.slotMapping);
        } catch (e) {
          console.error("Error parsing slotMapping:", e);
        }
      }

      // Get input file slots and output files from process
      const inputFileSlots = processData.inputFileSlots as InputFileSlot[] || [];
      const outputFiles = processData.outputFiles as OutputFile[] || [];
      const pythonCode = processData.pythonCode || '';

      if (!pythonCode) {
        return res.status(400).json({ 
          success: false,
          error: "Kein Python-Code für diesen Prozess definiert." 
        });
      }

      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: "Keine Dateien hochgeladen." 
        });
      }

      // Check Python service health
      const isPythonServiceAvailable = await checkPythonServiceHealth();
      if (!isPythonServiceAvailable) {
        return res.status(503).json({ 
          success: false,
          error: "Python-Service ist nicht verfügbar. Bitte versuchen Sie es später erneut." 
        });
      }

      // Map uploaded files to their variable names
      const filesForPython: Array<{ variable: string; content: Buffer; filename: string }> = [];
      
      for (const file of uploadedFiles) {
        // File fieldname is like "file_<slotId>"
        const slotId = file.fieldname.replace('file_', '');
        const variableName = slotMapping[slotId] || `data${filesForPython.length + 1}`;
        
        filesForPython.push({
          variable: variableName,
          content: file.buffer,
          filename: file.originalname,
        });
      }

      // Load pattern files only from macros explicitly referenced in the process
      // This ensures proper scoping and prevents cross-macro data exposure
      // Note: usedMacroIds already declared above in security check
      const patternFileErrors: string[] = [];
      
      if (usedMacroIds.length > 0) {
        try {
          for (const macroId of usedMacroIds) {
            const macro = await storage.getMacro(macroId);
            if (!macro) {
              console.warn(`Referenced macro ${macroId} not found`);
              continue;
            }
            
            const patternFiles = (macro.patternFiles as any[] || []);
            for (const pf of patternFiles) {
              try {
                // Extract bucket name and object name from storage path
                const storagePath = pf.storagePath;
                const pathMatch = storagePath.match(/^\/([^\/]+)\/(.+)$/);
                if (pathMatch) {
                  const bucketName = pathMatch[1];
                  const objectName = pathMatch[2];
                  
                  // Download file from object storage
                  const bucket = objectStorageClient.bucket(bucketName);
                  const file = bucket.file(objectName);
                  const [content] = await file.download();
                  
                  filesForPython.push({
                    variable: pf.variable,
                    content: content,
                    filename: pf.originalFilename || `pattern_${pf.id}`,
                  });
                  console.log(`Loaded pattern file from macro "${macro.name}": ${pf.variable} (${pf.originalFilename})`);
                } else {
                  patternFileErrors.push(`Ungültiger Speicherpfad für Variable "${pf.variable}"`);
                  console.warn(`Invalid storage path for pattern file ${pf.variable}: ${storagePath}`);
                }
              } catch (patternError) {
                patternFileErrors.push(`Fehler beim Laden von "${pf.variable}"`);
                console.error(`Error loading pattern file ${pf.variable}:`, patternError);
              }
            }
          }
        } catch (macroError) {
          console.error("Error loading pattern files from macros:", macroError);
        }
      }
      
      // Warn user about missing pattern files but don't block execution
      if (patternFileErrors.length > 0) {
        console.warn("Pattern file warnings:", patternFileErrors);
      }

      console.log("Executing Python code with files:", filesForPython.map(f => ({ var: f.variable, name: f.filename })));
      console.log("Output files config:", outputFiles);

      // Load global template files
      const templateFilesForPython: TemplateFileData[] = [];
      try {
        const allTemplateFiles = await storage.getTemplateFiles();
        for (const tpl of allTemplateFiles) {
          try {
            const storagePath = tpl.storagePath;
            const pathMatch = storagePath.match(/^\/([^\/]+)\/(.+)$/);
            if (pathMatch) {
              const bucketName = pathMatch[1];
              const objectName = pathMatch[2];
              
              const bucket = objectStorageClient.bucket(bucketName);
              const file = bucket.file(objectName);
              const [content] = await file.download();
              
              // Use name with extension from originalFilename for proper file matching
              const ext = tpl.originalFilename ? tpl.originalFilename.substring(tpl.originalFilename.lastIndexOf('.')) : '';
              const filenameForPython = tpl.name + ext;
              
              templateFilesForPython.push({
                name: filenameForPython,
                content_base64: content.toString('base64'),
              });
              console.log(`Loaded template file: ${filenameForPython}`);
            }
          } catch (tplError) {
            console.warn(`Failed to load template file ${tpl.name}:`, tplError);
          }
        }
      } catch (error) {
        console.warn("Error loading template files:", error);
      }

      // Create process execution record (status: pending)
      const execution = await storage.createProcessExecution({
        processId: processData.id,
        mandantId: processData.mandantId,
        status: "pending",
        month: month || null,
        quarter: quarter || null,
        year,
        inputFiles: inputFileSlots.map(slot => ({ slotId: slot.id, label: slot.label })),
        attachments: [],
        transactionCount: 0,
      });

      // Save uploaded files to object storage as attachments
      const attachments: Array<{ slotId: string; slotLabel: string; fileName: string; storagePath: string }> = [];
      
      for (const file of uploadedFiles) {
        const slotId = file.fieldname.replace('file_', '');
        const slot = inputFileSlots.find(s => s.id === slotId);
        const slotLabel = slot?.label || `File ${slotId}`;
        
        try {
          const storagePath = `/.private/executions/${execution.id}/${file.originalname}`;
          const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
          
          if (bucketId) {
            const bucket = objectStorageClient.bucket(bucketId);
            const fileObj = bucket.file(storagePath.replace(/^\/[^\/]+\//, ''));
            await fileObj.save(file.buffer);
            
            attachments.push({
              slotId,
              slotLabel,
              fileName: file.originalname,
              storagePath: `/${bucketId}${storagePath.replace(/^\/[^\/]+/, '')}`,
            });
          }
        } catch (uploadError) {
          console.error("Error uploading file to storage:", uploadError);
        }
      }

      // Update execution with attachments
      await storage.updateProcessExecution(execution.id, { attachments });

      // Get mandant info for Python variables
      const mandant = await storage.getMandant(processData.mandantId);
      const mandantInfo = mandant ? {
        mandantennummer: mandant.mandantenNummer,
        beraternummer: mandant.beraterNummer,
        sachkontenlaenge: mandant.sachkontenLaenge,
        sachkontenrahmen: mandant.sachkontenRahmen,
      } : undefined;

      // Prepare time period info for Python
      const timePeriodInfo: TimePeriodInfo = { year };
      if (month !== undefined) timePeriodInfo.month = month;
      if (quarter !== undefined) timePeriodInfo.quarter = quarter;

      // Execute Python code with template files, mandant info, and time period
      const pythonResult = await executePythonCode(
        filesForPython,
        pythonCode,
        outputFiles.map(of => ({
          id: of.id,
          name: of.name,
          dataFrameVariable: of.dataFrameVariable,
          format: of.format,
          delimiter: of.delimiter || ';',
        })),
        templateFilesForPython.length > 0 ? templateFilesForPython : undefined,
        mandantInfo,
        timePeriodInfo
      );

      if (!pythonResult.success) {
        // Update execution with failed status
        await storage.updateProcessExecution(execution.id, {
          status: "failed",
          completedAt: new Date(),
        });
        
        return res.status(400).json({
          success: false,
          error: pythonResult.error || "Fehler bei der Ausführung des Python-Codes.",
        });
      }

      // Process outputs and create download URLs
      const resultOutputs = pythonResult.outputs.map((output) => {
        if (!output.success) {
          return {
            name: output.name,
            format: output.format,
            error: output.error,
            success: false,
          };
        }

        // Create a data URL for download
        const contentType = output.content_type || 'application/octet-stream';
        const downloadUrl = `data:${contentType};base64,${output.content}`;

        return {
          name: `${output.name}.${output.format}`,
          format: output.format,
          downloadUrl,
          rowCount: output.row_count,
          columns: output.columns,
          success: true,
        };
      });

      // Calculate totals from first successful output
      const firstOutput = pythonResult.outputs.find(o => o.success);
      const transactionCount = firstOutput?.row_count || 0;

      // Store output data for history downloads - save the base64 content directly
      const outputDataForStorage = firstOutput ? {
        columns: firstOutput.columns,
        content: firstOutput.content,
        contentType: firstOutput.content_type,
        format: firstOutput.format,
        rowCount: firstOutput.row_count,
      } : null;

      // Calculate totalAmount from output data (umsatz column + sh column sign)
      let totalAmount: string | null = null;
      if (firstOutput?.content && firstOutput.columns) {
        try {
          const csvContent = Buffer.from(firstOutput.content, 'base64').toString('utf-8');
          const lines = csvContent.split('\n').filter(l => l.trim());
          if (lines.length > 1) {
            const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
            const umsatzIdx = headers.findIndex(h => h === 'umsatz');
            const shIdx = headers.findIndex(h => h === 'sh');
            
            if (umsatzIdx !== -1) {
              let sum = 0;
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                const rawValue = cols[umsatzIdx] || '0';
                const numValue = parseFloat(rawValue.replace(/\./g, '').replace(',', '.')) || 0;
                const shValue = (shIdx !== -1 ? cols[shIdx] : '').toUpperCase().trim();
                const sign = shValue === 'H' ? -1 : 1;
                sum += numValue * sign;
              }
              totalAmount = sum.toFixed(2);
              console.log(`Calculated totalAmount: ${totalAmount} (from ${lines.length - 1} rows)`);
            }
          }
        } catch (calcError) {
          console.warn("Error calculating totalAmount from output:", calcError);
        }
      }

      // Extract country, currency, and platform breakdowns from output data
      let countryBreakdown: Record<string, number> | null = null;
      let currencyBreakdown: Record<string, number> | null = null;
      let platformBreakdown: Record<string, number> | null = null;

      if (firstOutput?.content && firstOutput.columns) {
        try {
          const csvContent = Buffer.from(firstOutput.content, 'base64').toString('utf-8');
          const lines = csvContent.split('\n').filter(l => l.trim());
          if (lines.length > 1) {
            const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
            const umsatzIdx = headers.findIndex(h => h === 'umsatz');
            const shIdx = headers.findIndex(h => h === 'sh');
            const wkzIdx = headers.findIndex(h => h === 'wkz');
            const countryCol = (processData as any).countryColumn?.toLowerCase()?.trim();
            const countryIdx = countryCol ? headers.findIndex(h => h === countryCol) : -1;

            if (umsatzIdx !== -1) {
              const countryMap: Record<string, number> = {};
              const currencyMap: Record<string, number> = {};

              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                const rawValue = cols[umsatzIdx] || '0';
                const numValue = parseFloat(rawValue.replace(/\./g, '').replace(',', '.')) || 0;
                const shValue = (shIdx !== -1 ? cols[shIdx] : '').toUpperCase().trim();
                const sign = shValue === 'H' ? -1 : 1;
                const amount = numValue * sign;

                if (wkzIdx !== -1) {
                  const currency = (cols[wkzIdx] || '').trim().toUpperCase() || 'EUR';
                  currencyMap[currency] = (currencyMap[currency] || 0) + amount;
                }

                if (countryIdx !== -1) {
                  const country = (cols[countryIdx] || '').trim().toUpperCase() || 'UNBEKANNT';
                  if (country) {
                    countryMap[country] = (countryMap[country] || 0) + amount;
                  }
                }
              }

              if (Object.keys(countryMap).length > 0) countryBreakdown = countryMap;
              if (Object.keys(currencyMap).length > 0) currencyBreakdown = currencyMap;
            }

            const procPlatformName = (processData as any).platformName?.trim();
            if (procPlatformName && totalAmount) {
              platformBreakdown = { [procPlatformName]: parseFloat(totalAmount) };
            }
          }
        } catch (breakdownError) {
          console.warn("Error extracting breakdowns:", breakdownError);
        }
      }

      // Update execution with completed status and output data
      await storage.updateProcessExecution(execution.id, {
        status: "completed",
        completedAt: new Date(),
        transactionCount,
        outputData: outputDataForStorage,
        totalAmount,
        countryBreakdown,
        currencyBreakdown,
        platformBreakdown,
      });

      res.json({
        success: true,
        outputs: resultOutputs,
        executionId: execution.id,
      });
    } catch (error: any) {
      console.error("Error executing process:", error);
      res.status(500).json({ 
        success: false,
        error: error.message || "Failed to execute process" 
      });
    }
  });

  app.get("/api/process-executions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
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
      const userId = req.user!.id;
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
      const userId = req.user!.id;
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

  app.delete("/api/process-executions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const execution = await storage.getProcessExecutionById(id);
      if (!execution) {
        return res.status(404).json({ message: "Execution not found" });
      }
      
      if (!(await requireMandantAccess(req, res, execution.mandantId))) return;
      
      const attachments = (execution.attachments as { storagePath: string }[]) || [];
      for (const attachment of attachments) {
        try {
          await objectStorageClient.deleteFile(attachment.storagePath);
        } catch (deleteError) {
          console.error("Error deleting attachment from storage:", deleteError);
        }
      }
      
      await storage.deleteProcessExecution(id);
      res.json({ message: "Execution deleted successfully" });
    } catch (error) {
      console.error("Error deleting execution:", error);
      res.status(500).json({ message: "Failed to delete execution" });
    }
  });

  app.get("/api/process-executions/:id/attachments/:fileName", isAuthenticated, async (req: any, res) => {
    try {
      const { id, fileName } = req.params;
      
      const execution = await storage.getProcessExecutionById(id);
      if (!execution) {
        return res.status(404).json({ message: "Execution not found" });
      }
      
      if (!(await requireMandantAccess(req, res, execution.mandantId))) return;
      
      const attachments = (execution.attachments as { slotId: string; fileName: string; storagePath: string }[]) || [];
      const attachment = attachments.find(a => a.fileName === fileName);
      
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      
      const storagePath = attachment.storagePath;
      const pathParts = storagePath.replace(/^\//, '').split('/');
      const bucketName = pathParts[0];
      const objectName = pathParts.slice(1).join('/');
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [fileData] = await file.download();
      
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      
      const ext = fileName.toLowerCase().split('.').pop();
      const contentTypes: Record<string, string> = {
        'csv': 'text/csv',
        'txt': 'text/plain',
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
      };
      res.setHeader("Content-Type", contentTypes[ext || ''] || "application/octet-stream");
      res.send(fileData);
    } catch (error) {
      console.error("Error downloading attachment:", error);
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  app.get("/api/process-executions/:id/result", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { delimiter = 'semicolon', format = 'csv' } = req.query;
      
      const execution = await storage.getProcessExecution(id);
      if (!execution) {
        return res.status(404).json({ message: "Execution not found" });
      }
      
      const processData = await storage.getProcess(execution.processId);
      if (!processData) {
        return res.status(404).json({ message: "Process not found" });
      }
      
      if (!(await requireMandantAccess(req, res, processData.mandantId))) return;
      
      const outputData = execution.outputData as { 
        content?: string;
        contentType?: string;
        format?: string;
        columns?: string[];
        rowCount?: number;
      } | null;
      
      if (!outputData || !outputData.content) {
        return res.status(404).json({ message: "No transformation result available" });
      }
      
      if (format === 'datev') {
        const mandant = await storage.getMandant(processData.mandantId);
        if (!mandant) {
          return res.status(404).json({ message: "Mandant not found" });
        }

        const csvBuffer = Buffer.from(outputData.content, 'base64');

        const patternTemplate = await storage.getTemplateFileByName('pattern_datev');
        let patternBuffer: Buffer | null = null;
        if (patternTemplate) {
          try {
            const storagePath = patternTemplate.storagePath;
            const pathMatch = storagePath.match(/^\/([^\/]+)\/(.+)$/);
            if (pathMatch) {
              const bucket = objectStorageClient.bucket(pathMatch[1]);
              const file = bucket.file(pathMatch[2]);
              const [content] = await file.download();
              patternBuffer = content;
            }
          } catch (err) {
            console.warn("Failed to load pattern_datev template:", err);
          }
        }

        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('output_csv', csvBuffer, { filename: 'output.csv', contentType: 'text/csv' });
        if (patternBuffer) {
          formData.append('pattern_file', patternBuffer, { filename: 'pattern_datev.csv', contentType: 'text/csv' });
        }
        formData.append('mandant_info', JSON.stringify({
          mandantennummer: mandant.mandantenNummer,
          beraternummer: mandant.beraterNummer,
          sachkontenlaenge: mandant.sachkontenLaenge,
          sachkontenrahmen: mandant.sachkontenRahmen,
        }));
        formData.append('time_period_info', JSON.stringify({
          month: execution.month || 1,
          year: execution.year || new Date().getFullYear(),
        }));
        formData.append('process_name', processData.name || '');

        const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
        const fetchModule = await import('node-fetch');
        const pythonRes = await fetchModule.default(`${PYTHON_SERVICE_URL}/export-datev`, {
          method: 'POST',
          body: formData as any,
          headers: formData.getHeaders(),
        });

        const result = await pythonRes.json() as any;
        if (!result.success) {
          return res.status(500).json({ message: result.error || 'DATEV export failed' });
        }

        const datevContent = Buffer.from(result.content, 'base64').toString('utf-8');
        const fileName = `DATEV_${processData.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${execution.month}_${execution.year}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(datevContent);
      } else {
        const csvContent = Buffer.from(outputData.content, 'base64').toString('utf-8');
        const fileName = `${processData.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${execution.month}_${execution.year}_result.csv`;
        
        res.setHeader('Content-Type', outputData.contentType || 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csvContent);
      }
      
    } catch (error) {
      console.error("Error downloading result:", error);
      res.status(500).json({ message: "Failed to download result" });
    }
  });

  app.get("/api/financial-summary", isAuthenticated, async (req: any, res) => {
    try {
      const { mandantId, month, year } = req.query;
      
      if (!mandantId) {
        return res.status(400).json({ message: "mandantId required" });
      }
      
      if (!(await requireMandantAccess(req, res, mandantId as string))) return;
      
      const processes = await storage.getProcesses(mandantId as string);
      const executions = await storage.getProcessExecutions(
        mandantId as string,
        month ? parseInt(month as string) : undefined,
        year ? parseInt(year as string) : undefined
      );
      
      let totalRevenue = 0;
      let totalPayments = 0;
      const revenueByCountry: Record<string, number> = {};
      const paymentsByCountry: Record<string, number> = {};
      
      for (const execution of executions) {
        if (execution.status !== "completed") continue;
        
        const process = processes.find(p => p.id === execution.processId);
        if (!process) continue;
        
        const amount = parseFloat(execution.totalAmount || "0");
        const countryData = execution.countryBreakdown as Record<string, number> | null;
        
        if (process.processType === "revenue") {
          totalRevenue += amount;
          if (countryData) {
            for (const [country, countryAmount] of Object.entries(countryData)) {
              revenueByCountry[country] = (revenueByCountry[country] || 0) + countryAmount;
            }
          }
        } else {
          totalPayments += amount;
          if (countryData) {
            for (const [country, countryAmount] of Object.entries(countryData)) {
              paymentsByCountry[country] = (paymentsByCountry[country] || 0) + countryAmount;
            }
          }
        }
      }
      
      res.json({
        totalRevenue,
        totalPayments,
        revenueByCountry,
        paymentsByCountry,
        difference: totalRevenue - totalPayments,
        ratio: totalRevenue > 0 ? (totalPayments / totalRevenue * 100).toFixed(1) : 0,
      });
    } catch (error) {
      console.error("Error fetching financial summary:", error);
      res.status(500).json({ message: "Failed to fetch financial summary" });
    }
  });

  app.get("/api/exports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user!.id;
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
      const userId = req.user!.id;
      const { processExecutionId, format, delimiter, mandantId } = req.body;
      
      if (!(await requireMandantAccess(req, res, mandantId))) return;
      
      const execution = await storage.getProcessExecution(processExecutionId);
      if (!execution) {
        return res.status(404).json({ message: "Process execution not found" });
      }
      
      if (execution.mandantId !== mandantId) {
        return res.status(403).json({ message: "Execution does not belong to this mandant" });
      }

      const mandant = await storage.getMandant(mandantId);
      const exportData = generateExportData(execution, format, mandant, delimiter);

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
      const userId = req.user!.id;
      const exportRecord = await storage.getExportRecord(req.params.id);
      
      if (!exportRecord) {
        return res.status(404).json({ message: "Export not found" });
      }
      
      if (!(await requireMandantAccess(req, res, exportRecord.mandantId))) return;
      
      const filename = `${exportRecord.name}.csv`;
      const content = formatExportContent(exportRecord.exportData, exportRecord.format);
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
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

  // Macro routes (admin only)
  app.get("/api/macros", isAuthenticated, async (req: any, res) => {
    try {
      const macros = await storage.getMacros();
      res.json(macros);
    } catch (error) {
      console.error("Error fetching macros:", error);
      res.status(500).json({ message: "Failed to fetch macros" });
    }
  });

  app.get("/api/macros/:id", isAuthenticated, async (req: any, res) => {
    try {
      const macro = await storage.getMacro(req.params.id);
      if (!macro) {
        return res.status(404).json({ message: "Macro not found" });
      }
      res.json(macro);
    } catch (error) {
      console.error("Error fetching macro:", error);
      res.status(500).json({ message: "Failed to fetch macro" });
    }
  });

  app.post("/api/macros", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const data = insertMacroSchema.parse(req.body);
      const macro = await storage.createMacro(data);
      res.status(201).json(macro);
    } catch (error) {
      console.error("Error creating macro:", error);
      res.status(500).json({ message: "Failed to create macro" });
    }
  });

  app.patch("/api/macros/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const updateData = insertMacroSchema.partial().parse(req.body);
      const macro = await storage.updateMacro(req.params.id, updateData);
      if (!macro) {
        return res.status(404).json({ message: "Macro not found" });
      }
      res.json(macro);
    } catch (error) {
      console.error("Error updating macro:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update macro" });
    }
  });

  app.delete("/api/macros/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      await storage.deleteMacro(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting macro:", error);
      res.status(500).json({ message: "Failed to delete macro" });
    }
  });

  // Upload pattern file for a macro
  app.post("/api/macros/:id/pattern-files", isAuthenticated, isInternalOnly, upload.single('file'), async (req: any, res) => {
    try {
      const macro = await storage.getMacro(req.params.id);
      if (!macro) {
        return res.status(404).json({ message: "Macro not found" });
      }

      const file = req.file as Express.Multer.File;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const variable = req.body.variable || `pattern_${Date.now()}`;
      const patternName = req.body.name || file.originalname;

      // Store the file in object storage
      const envPrivateDir = globalThis.process.env.PRIVATE_OBJECT_DIR || '';
      const bucketMatch = envPrivateDir.match(/^\/([^\/]+)\//);
      const bucketName = bucketMatch ? bucketMatch[1] : '';

      if (!bucketName) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      const fileId = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const objectName = `${envPrivateDir.replace(/^\/[^\/]+\//, '')}/macros/${macro.id}/${fileId}_${file.originalname}`;
      
      const bucket = objectStorageClient.bucket(bucketName);
      const storageFile = bucket.file(objectName);
      await storageFile.save(file.buffer);

      const patternFile = {
        id: fileId,
        name: patternName,
        variable,
        storagePath: `/${bucketName}/${objectName}`,
        originalFilename: file.originalname,
      };

      const currentPatternFiles = (macro.patternFiles as any[] || []);
      const updatedPatternFiles = [...currentPatternFiles, patternFile];

      const updatedMacro = await storage.updateMacro(macro.id, {
        patternFiles: updatedPatternFiles,
      } as any);

      res.status(201).json(patternFile);
    } catch (error) {
      console.error("Error uploading pattern file:", error);
      res.status(500).json({ message: "Failed to upload pattern file" });
    }
  });

  // Delete pattern file from a macro
  app.delete("/api/macros/:id/pattern-files/:fileId", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const macro = await storage.getMacro(req.params.id);
      if (!macro) {
        return res.status(404).json({ message: "Macro not found" });
      }

      const currentPatternFiles = (macro.patternFiles as any[] || []);
      const fileToDelete = currentPatternFiles.find((f: any) => f.id === req.params.fileId);
      
      if (!fileToDelete) {
        return res.status(404).json({ message: "Pattern file not found" });
      }

      // Delete from object storage
      try {
        const storagePath = fileToDelete.storagePath;
        const pathMatch = storagePath.match(/^\/([^\/]+)\/(.+)$/);
        if (pathMatch) {
          const [, bucketName, objectName] = pathMatch;
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          await file.delete();
        }
      } catch (deleteError) {
        console.error("Error deleting file from storage:", deleteError);
      }

      const updatedPatternFiles = currentPatternFiles.filter((f: any) => f.id !== req.params.fileId);
      await storage.updateMacro(macro.id, {
        patternFiles: updatedPatternFiles,
      } as any);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pattern file:", error);
      res.status(500).json({ message: "Failed to delete pattern file" });
    }
  });

  // Get pattern files for process execution
  app.get("/api/macros/pattern-files", isAuthenticated, async (req: any, res) => {
    try {
      const macros = await storage.getMacros();
      const allPatternFiles: any[] = [];

      for (const macro of macros) {
        const patternFiles = (macro.patternFiles as any[] || []);
        for (const pf of patternFiles) {
          allPatternFiles.push({
            ...pf,
            macroId: macro.id,
            macroName: macro.name,
          });
        }
      }

      res.json(allPatternFiles);
    } catch (error) {
      console.error("Error fetching pattern files:", error);
      res.status(500).json({ message: "Failed to fetch pattern files" });
    }
  });

  // Template Files CRUD - Global vorlagen files
  app.get("/api/template-files", isAuthenticated, async (req: any, res) => {
    try {
      const files = await storage.getTemplateFiles();
      res.json(files);
    } catch (error) {
      console.error("Error fetching template files:", error);
      res.status(500).json({ message: "Failed to fetch template files" });
    }
  });

  app.get("/api/template-files/:id", isAuthenticated, async (req: any, res) => {
    try {
      const file = await storage.getTemplateFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Template file not found" });
      }
      res.json(file);
    } catch (error) {
      console.error("Error fetching template file:", error);
      res.status(500).json({ message: "Failed to fetch template file" });
    }
  });

  app.post("/api/template-files", isAuthenticated, isInternalOnly, upload.single('file'), async (req: any, res) => {
    try {
      const file = req.file as Express.Multer.File;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const name = req.body.name;
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      // Check if name is already taken
      const existing = await storage.getTemplateFileByName(name);
      if (existing) {
        return res.status(400).json({ message: "A template file with this name already exists" });
      }

      // Store the file in object storage under vorlagen/
      const envPrivateDir = globalThis.process.env.PRIVATE_OBJECT_DIR || '';
      const bucketMatch = envPrivateDir.match(/^\/([^\/]+)\//);
      const bucketName = bucketMatch ? bucketMatch[1] : '';

      if (!bucketName) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      const fileId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const objectName = `${envPrivateDir.replace(/^\/[^\/]+\//, '')}/vorlagen/${name}`;
      
      const bucket = objectStorageClient.bucket(bucketName);
      const storageFile = bucket.file(objectName);
      await storageFile.save(file.buffer);

      const templateFile = await storage.createTemplateFile({
        name,
        originalFilename: file.originalname,
        storagePath: `/${bucketName}/${objectName}`,
        description: req.body.description || '',
      });

      res.status(201).json(templateFile);
    } catch (error) {
      console.error("Error uploading template file:", error);
      res.status(500).json({ message: "Failed to upload template file" });
    }
  });

  app.patch("/api/template-files/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const file = await storage.getTemplateFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Template file not found" });
      }

      const { description } = req.body;
      const updated = await storage.updateTemplateFile(req.params.id, { description });
      res.json(updated);
    } catch (error) {
      console.error("Error updating template file:", error);
      res.status(500).json({ message: "Failed to update template file" });
    }
  });

  app.delete("/api/template-files/:id", isAuthenticated, isInternalOnly, async (req: any, res) => {
    try {
      const file = await storage.getTemplateFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Template file not found" });
      }

      // Delete from object storage
      try {
        const storagePath = file.storagePath;
        const pathMatch = storagePath.match(/^\/([^\/]+)\/(.+)$/);
        if (pathMatch) {
          const [, bucketName, objectName] = pathMatch;
          const bucket = objectStorageClient.bucket(bucketName);
          const storageFile = bucket.file(objectName);
          await storageFile.delete();
        }
      } catch (deleteError) {
        console.error("Error deleting file from storage:", deleteError);
      }

      await storage.deleteTemplateFile(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template file:", error);
      res.status(500).json({ message: "Failed to delete template file" });
    }
  });

  app.get("/api/template-files/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const file = await storage.getTemplateFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Template file not found" });
      }

      const storagePath = file.storagePath;
      const pathMatch = storagePath.match(/^\/([^\/]+)\/(.+)$/);
      if (!pathMatch) {
        return res.status(500).json({ message: "Invalid storage path" });
      }

      const [, bucketName, objectName] = pathMatch;
      const bucket = objectStorageClient.bucket(bucketName);
      const storageFile = bucket.file(objectName);
      const [content] = await storageFile.download();

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename}"`);
      res.send(content);
    } catch (error) {
      console.error("Error downloading template file:", error);
      res.status(500).json({ message: "Failed to download template file" });
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

function generateExportData(execution: any, format: string, mandant: any, delimiter?: string): any {
  const outputData = execution.outputData;
  
  if (format === 'datev') {
    const data = outputData as TransactionData;
    const transactions = data?.transactions || [];
    return generateDatevExport(transactions, mandant);
  } else {
    const delimiterMap: Record<string, string> = {
      'comma': ',',
      'semicolon': ';',
      'tab': '\t'
    };
    const actualDelimiter = delimiterMap[delimiter || 'semicolon'] || ';';
    return generateAsciiExport(outputData, actualDelimiter);
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

function generateAsciiExport(outputData: any, delimiter: string): any {
  const columns = outputData?.columns || [];
  const transactions = outputData?.transactions || [];
  
  if (columns.length > 0 && transactions.length > 0) {
    return { 
      columns, 
      data: transactions, 
      format: 'ASCII', 
      delimiter 
    };
  }
  
  const lines = transactions.map((t: any) => ({
    datum: t.datum,
    betrag: parseFloat(t.betrag) || 0,
    text: t.beschreibung || '',
    konto: calculateKonto(t.typ, 4),
    gegenkonto: calculateGegenkonto(t.typ, 4),
  }));
  
  return { lines, format: 'ASCII', delimiter };
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
    const { columns, data, lines, delimiter } = exportData;
    
    if (columns && columns.length > 0 && data && data.length > 0) {
      const escapeValue = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const headerLine = columns.map(escapeValue).join(delimiter);
      const dataLines = data.map((row: Record<string, any>) => 
        columns.map((col: string) => escapeValue(row[col])).join(delimiter)
      );
      return [headerLine, ...dataLines].join('\r\n');
    }
    
    if (lines && lines.length > 0) {
      const headerLine = `Datum${delimiter}Betrag${delimiter}Text${delimiter}Konto${delimiter}Gegenkonto`;
      const dataLines = lines.map((l: any) => 
        `${l.datum}${delimiter}${l.betrag.toFixed(2).replace('.', ',')}${delimiter}${l.text}${delimiter}${l.konto}${delimiter}${l.gegenkonto}`
      );
      return [headerLine, ...dataLines].join('\r\n');
    }
    
    return '';
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
