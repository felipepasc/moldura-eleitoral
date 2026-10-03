import type { NextConfig } from "next";
import { DEFAULT_API_ORIGIN, DEFAULT_IMAGES_ORIGIN, normalizeOrigin } from "./src/lib/origin";

const isDev = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

const apiOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_API_URL, DEFAULT_API_ORIGIN);
const imagesOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_IMAGES_ORIGIN, DEFAULT_IMAGES_ORIGIN);

if (!imagesOrigin) {
  console.warn("Aviso: NEXT_PUBLIC_IMAGES_ORIGIN ausente ou inválida; imagens do MinIO ficarão bloqueadas pelo CSP.");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: blob: ${imagesOrigin}`.trim(),
  `connect-src 'self' ${apiOrigin}${isDev ? " ws:" : ""}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS só em produção (fora do dev local).
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

// Um aviso só por build (a config é carregada mais de uma vez; os processos filhos herdam a marca).
if ((!process.env.NEXT_PUBLIC_OPERATOR_NAME || !process.env.NEXT_PUBLIC_CONTACT_EMAIL) && !process.env.MOLDURA_OPERATOR_WARNED) {
  process.env.MOLDURA_OPERATOR_WARNED = "1";
  console.warn("Aviso: NEXT_PUBLIC_OPERATOR_NAME e/ou NEXT_PUBLIC_CONTACT_EMAIL não definidos; as páginas /privacidade e /termos ficam sem o bloco de operador e contato.");
}

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@moldura/common"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
