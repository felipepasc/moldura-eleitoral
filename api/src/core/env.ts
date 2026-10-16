import { z } from "zod";
import { DEFAULT_SALES_BLACKOUT, parseBlackout } from "@/core/blackout";

const BooleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const ProxyHops = z.preprocess(
  (value) => {
    if (value === "false" || value === undefined || value === "") {
      return 0;
    }

    if (value === "true") {
      return 1;
    }

    return value;
  },
  z.coerce.number().int().min(0).max(10),
);

const EnvSchema = z.object({
    PORT: z.coerce.number().default(6600),
    DATABASE_URL: z.string().min(1),
    WEB_ORIGIN: z.string().default("http://localhost:6610"),
    TRUST_PROXY: ProxyHops,
    // Fail-closed: sem valor explícito as vendas ficam fechadas.
    SALES_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    // Intervalos início/fim (ISO com fuso, separados por vírgula); vazio = sem blackout; inválido derruba a subida.
    SALES_BLACKOUT: z.string().default(DEFAULT_SALES_BLACKOUT).transform((value) => parseBlackout(value)),
    MINIO_ENDPOINT: z.string().default("localhost"),
    MINIO_PORT: z.coerce.number().default(9300),
    MINIO_USE_SSL: BooleanFlag,
    MINIO_REGION: z.string().default("us-east-1"),
    MINIO_ACCESS_KEY: z.string().min(1),
    MINIO_SECRET_KEY: z.string().min(1),
    MINIO_BUCKET: z.string().default("moldura"),
    // Pix pelo Core (felipepasc.com): a chave fk_ do serviço e o segredo whsec_ do endereço de aviso.
    CORE_API_URL: z.string().url().default("https://felipepasc.com"),
    CORE_API_KEY: z.string().startsWith("fk_"),
    CORE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  });

export function parseEnv(source: Record<string, string | undefined>) {
  const present = Object.fromEntries(Object.entries(source).filter(([key, value]) => value !== undefined && (value !== "" || key === "SALES_BLACKOUT")));

  return EnvSchema.parse(present);
}

export const env = parseEnv(process.env);
