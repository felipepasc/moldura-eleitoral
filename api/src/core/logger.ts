import pino from "pino";
import type { DestinationStream, Logger } from "pino";

export type { Logger };

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

export function sanitizeUrl(url: string): string {
  const [path] = url.split("?");

  return (path ?? url).replace(UUID_SEGMENT, "/:id");
}

const STORAGE_KEY_PATTERN = /\b(?:photos|results)\/[^\s"'`,;)]*/g;

function redactKeys(text: string): string {
  return text.replace(STORAGE_KEY_PATTERN, "[chave]");
}

function errorCode(error: Record<string, unknown>): string | undefined {
  const cause = error.cause;

  if (typeof error.code === "string") {
    return error.code;
  }

  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
    return cause.code;
  }

  return undefined;
}

function isQueryError(error: Error): boolean {
  return "params" in error || "parameters" in error || "query" in error || error.message.startsWith("Failed query");
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { type: "NonError" };
  }

  const code = errorCode(err as unknown as Record<string, unknown>);

  if (isQueryError(err)) {
    return { type: err.name, message: "Falha em consulta ao banco", code };
  }

  return {
    type: err.name,
    message: redactKeys(err.message),
    code,
    stack: err.stack ? redactKeys(err.stack) : undefined,
  };
}

export function createLogger(stream?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      serializers: {
        req(req) {
          return { method: req.method, url: sanitizeUrl(req.url) };
        },
        err: serializeError,
      },
    },
    stream,
  );
}

export const logger = createLogger();
