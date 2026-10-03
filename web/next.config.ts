import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6600");
const imagesOrigin = originOf(process.env.NEXT_PUBLIC_IMAGES_ORIGIN ?? "http://localhost:9300");

if (!imagesOrigin.startsWith("http://") && !imagesOrigin.startsWith("https://")) {
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
];

const config: NextConfig = {
  transpilePackages: ["@moldura/common"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
