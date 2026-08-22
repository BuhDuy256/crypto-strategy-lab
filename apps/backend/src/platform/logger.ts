// Structured logger.
//
// Every log line is a record carrying a timestamp, a level, the process
// role (which runtime role emitted it, e.g. "api"), and the current
// request identifier when one is available. In development the record
// is pretty-printed for human reading; in production it is raw JSON so
// log collectors can parse it as one record per line.

import type { LoggerService } from "@nestjs/common";
import { getRequestId } from "./request-context.js";

export type LogLevel = "log" | "error" | "warn" | "debug" | "verbose";

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly processRole: string;
  readonly requestId: string | null;
  readonly message: string;
  readonly context?: string;
}

/** Builds one structured log record. Pure, so it is directly testable. */
export function buildLogRecord(
  level: LogLevel,
  message: string,
  processRole: string,
  requestId: string | null,
  context?: string
): LogRecord {
  return {
    timestamp: new Date().toISOString(),
    level,
    processRole,
    requestId,
    message,
    ...(context !== undefined ? { context } : {})
  };
}

/** Renders a record as pretty text (development) or raw JSON (production). */
export function formatLogRecord(record: LogRecord, pretty: boolean): string {
  if (!pretty) {
    return JSON.stringify(record);
  }
  const contextPart = record.context !== undefined ? ` [${record.context}]` : "";
  const requestIdPart = record.requestId !== null ? ` request=${record.requestId}` : "";
  return `${record.timestamp} ${record.level.toUpperCase().padEnd(7)} ${record.processRole}${contextPart}${requestIdPart} ${record.message}`;
}

function isProductionMode(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Extracts the trailing string context Nest's LoggerService callers often pass. */
function lastStringContext(optionalParams: readonly unknown[]): string | undefined {
  const last = optionalParams[optionalParams.length - 1];
  return typeof last === "string" ? last : undefined;
}

function toMessageText(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.stack ?? message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/**
 * NestJS-compatible structured logger. One instance per process role
 * (e.g. `new StructuredLogger("api")`); pass it to `NestFactory.create`.
 */
export class StructuredLogger implements LoggerService {
  private readonly processRole: string;
  private readonly pretty: boolean;

  constructor(processRole: string, options: { pretty?: boolean } = {}) {
    this.processRole = processRole;
    this.pretty = options.pretty ?? !isProductionMode();
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("log", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("verbose", message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: readonly unknown[]): void {
    const context = lastStringContext(optionalParams);
    const record = buildLogRecord(
      level,
      toMessageText(message),
      this.processRole,
      getRequestId() ?? null,
      context
    );
    const line = formatLogRecord(record, this.pretty);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}
