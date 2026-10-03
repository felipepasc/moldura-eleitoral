import pino from "pino";
import type { DestinationStream, Logger } from "pino";

export type { Logger };

export function sanitizeUrl(url: string): string {
  const [path] = url.split("?");

  return path ?? url;
}

export function createLogger(stream?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      serializers: {
        req(req) {
          return { method: req.method, url: sanitizeUrl(req.url) };
        },
      },
    },
    stream,
  );
}

export const logger = createLogger();
