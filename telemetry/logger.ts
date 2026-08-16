import fs from "node:fs";
import path from "node:path";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export type TelemetryEvent = {
  timestamp: string;
  level: LogLevel;
  event: string;
  data?: Record<string, unknown>;
  error?: string;
};

export const getLogDir = (): string => {
  if (process.env.WISP_LOG_DIR) return process.env.WISP_LOG_DIR;
  return path.join(process.cwd(), ".agent", "logs");
};

export const getLogFilePath = (): string => {
  return path.join(getLogDir(), "wisp.log");
};

export class Logger {
  private dir: string;
  private filePath: string;

  constructor() {
    this.dir = getLogDir();
    this.filePath = getLogFilePath();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  log(level: LogLevel, event: string, data?: Record<string, unknown>, error?: unknown): void {
    try {
      this.ensureDir();
      const payload: TelemetryEvent = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...(data ? { data } : {}),
        ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
      };

      const line = JSON.stringify(payload) + "\n";
      fs.appendFileSync(this.filePath, line, "utf-8");
    } catch {
      // Silent catch so logging failures never break primary execution
    }
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.log("INFO", event, data);
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.log("WARN", event, data);
  }

  error(event: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log("ERROR", event, data, error);
  }

  logToolStart(name: string, callId: string, args: unknown): void {
    this.info("tool_start", { name, callId, arguments: args });
  }

  logToolEnd(
    name: string,
    callId: string,
    durationMs: number,
    success: boolean,
    error?: string,
  ): void {
    this.info("tool_end", { name, callId, durationMs, success, error });
  }
}

export const logger = new Logger();
