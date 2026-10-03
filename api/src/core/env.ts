import { z } from "zod";

const BooleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const EnvSchema = z.object({
  PORT: z.coerce.number().default(6600),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:6610"),
  TRUST_PROXY: BooleanFlag,
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9300),
  MINIO_USE_SSL: BooleanFlag,
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default("moldura"),
  ABACATEPAY_API_KEY: z.string().min(1),
  ABACATEPAY_BASE_URL: z.string().default("https://api.abacatepay.com/v2"),
  ABACATEPAY_WEBHOOK_SECRET: z.string().min(16),
});

export const env = EnvSchema.parse(process.env);
