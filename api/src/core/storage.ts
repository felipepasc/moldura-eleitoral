import { Client } from "minio";
import type { Logger } from "@/core/logger";
import { env } from "@/core/env";
import { logger } from "@/core/logger";

export interface Storage {
  ensureBucket(): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, seconds: number): Promise<string>;
}

const PHOTO_EXPIRY_DAYS = 4;
const RESULT_EXPIRY_DAYS = 8;

export type StorageConfig = {
  endpoint: string;
  port: number;
  useSSL: boolean;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  logger?: Logger;
};

export type StorageClient = Pick<Client, "bucketExists" | "makeBucket" | "setBucketLifecycle" | "putObject" | "getObject" | "removeObject" | "presignedGetObject">;

function configFromEnv(): StorageConfig {
  return {
    endpoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    region: env.MINIO_REGION,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    bucket: env.MINIO_BUCKET,
  };
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

// Serve MinIO (dev) e Cloudflare R2 (produção): a mesma API S3, sempre em path-style.
export function createMinioStorage(config: StorageConfig = configFromEnv(), injected?: StorageClient): Storage {
  const bucket = config.bucket;
  const log = config.logger ?? logger;
  const client: StorageClient =
    injected ??
    new Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      region: config.region,
      pathStyle: true,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

  return {
    async ensureBucket() {
      // Em produção as credenciais podem não ter permissão de criar bucket: só cria se faltar.
      const exists = await client.bucketExists(bucket);

      if (!exists) {
        try {
          await client.makeBucket(bucket);
        } catch (error) {
          log.error({ code: errorCode(error) }, "Não consegui criar o bucket; crie-o no provedor ou confira as permissões");

          throw error;
        }
      }

      try {
        await client.setBucketLifecycle(bucket, {
          Rule: [
            { ID: "expire-photos", Status: "Enabled", Filter: { Prefix: "photos/" }, Expiration: { Days: PHOTO_EXPIRY_DAYS } },
            { ID: "expire-results", Status: "Enabled", Filter: { Prefix: "results/" }, Expiration: { Days: RESULT_EXPIRY_DAYS } },
          ],
        });
      } catch (error) {
        log.warn({ code: errorCode(error) }, "Não consegui configurar a expiração automática do bucket");
      }
    },

    async put(key, body, contentType) {
      await client.putObject(bucket, key, body, body.length, { "Content-Type": contentType });
    },

    async get(key) {
      const stream = await client.getObject(bucket, key);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    },

    async remove(key) {
      await client.removeObject(bucket, key);
    },

    async signedUrl(key, seconds) {
      return client.presignedGetObject(bucket, key, seconds, {
        "response-content-disposition": 'attachment; filename="minha-moldura.png"',
      });
    },
  };
}
