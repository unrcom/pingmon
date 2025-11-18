import type { LogLevel, LogContext } from "../types/types.ts";

export class Logger {
  constructor(private component: string = "standalone-worker") {}

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...(context && { context }),
    };

    const output = JSON.stringify(logEntry);

    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "debug":
      case "info":
      default:
        console.log(output);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  child(component: string): Logger {
    return new Logger(`${this.component}:${component}`);
  }
}

export function createLogger(component?: string): Logger {
  return new Logger(component);
}
