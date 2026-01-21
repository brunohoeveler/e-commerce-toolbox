import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { spawn, ChildProcess } from "child_process";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

let pythonProcess: ChildProcess | null = null;

function startPythonService() {
  log("Starting Python transformation service...", "python");
  
  pythonProcess = spawn("python", ["python_service/main.py"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  
  pythonProcess.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().trim().split("\n");
    lines.forEach((line: string) => {
      if (line.trim()) log(line, "python");
    });
  });
  
  pythonProcess.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().trim().split("\n");
    lines.forEach((line: string) => {
      if (line.trim()) log(line, "python-err");
    });
  });
  
  pythonProcess.on("error", (err) => {
    log(`Python service failed to start: ${err.message}`, "python-err");
  });
  
  pythonProcess.on("exit", (code) => {
    log(`Python service exited with code ${code}`, "python");
    if (code !== 0) {
      setTimeout(() => {
        log("Attempting to restart Python service...", "python");
        startPythonService();
      }, 5000);
    }
  });
}

process.on("exit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

(async () => {
  startPythonService();
  
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
