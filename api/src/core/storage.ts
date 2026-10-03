import { Client } from "minio";
import { env } from "@/core/env";
import { logger } from "@/core/logger";

export interface Storage {
  ensureBucket(): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, seconds: number): Promise<string>;
}

const PHOTO_EXPIRY_DAYS = 2;
const RESULT_EXPIRY_DAYS = 8;

export function createMinioStorage(): Storage {
  const bucket = env.MINIO_BUCKET;
  const client = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  return {
    async ensureBucket() {
      const exists = await client.bucketExists(bucket);

      if (!exists) {
        await client.makeBucket(bucket);
      }

      try {
        await client.setBucketLifecycle(bucket, {
          Rule: [
            { ID: "expire-photos", Status: "Enabled", Filter: { Prefix: "photos/" }, Expiration: { Days: PHOTO_EXPIRY_DAYS } },
            { ID: "expire-results", Status: "Enabled", Filter: { Prefix: "results/" }, Expiration: { Days: RESULT_EXPIRY_DAYS } },
          ],
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;

        logger.warn({ code }, "Não consegui configurar a expiração automática do bucket");
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
