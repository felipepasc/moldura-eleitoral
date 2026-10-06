import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "@/core/env";

const BASE = { DATABASE_URL: "x", MINIO_ACCESS_KEY: "a", MINIO_SECRET_KEY: "b" };

test("PIX_GATEWAY padrão é woovi e exige WOOVI_APP_ID", () => {
  assert.throws(() => parseEnv(BASE));

  const env = parseEnv({ ...BASE, WOOVI_APP_ID: "app" });

  assert.equal(env.PIX_GATEWAY, "woovi");
  assert.equal(env.WOOVI_BASE_URL, "https://api.woovi.com");
});

test("PIX_GATEWAY=abacatepay exige as variáveis da AbacatePay e não a Woovi", () => {
  assert.throws(() => parseEnv({ ...BASE, PIX_GATEWAY: "abacatepay" }));

  const env = parseEnv({ ...BASE, PIX_GATEWAY: "abacatepay", ABACATEPAY_API_KEY: "k", ABACATEPAY_WEBHOOK_SECRET: "0123456789abcdef" });

  assert.equal(env.PIX_GATEWAY, "abacatepay");
});

test("PIX_GATEWAY inválido é recusado", () => {
  assert.throws(() => parseEnv({ ...BASE, PIX_GATEWAY: "outro", WOOVI_APP_ID: "app" }));
});

test("PARTY_STYLE_ENABLED: padrão true; \"false\" desliga o estilo do partido; valor inválido derruba a subida", () => {
  const withWoovi = { ...BASE, WOOVI_APP_ID: "app" };

  assert.equal(parseEnv(withWoovi).PARTY_STYLE_ENABLED, true);
  assert.equal(parseEnv({ ...withWoovi, PARTY_STYLE_ENABLED: "true" }).PARTY_STYLE_ENABLED, true);
  assert.equal(parseEnv({ ...withWoovi, PARTY_STYLE_ENABLED: "false" }).PARTY_STYLE_ENABLED, false);
  assert.throws(() => parseEnv({ ...withWoovi, PARTY_STYLE_ENABLED: "talvez" }));
});
