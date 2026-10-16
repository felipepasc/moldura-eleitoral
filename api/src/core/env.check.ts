import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "@/core/env";

const BASE = { DATABASE_URL: "x", MINIO_ACCESS_KEY: "a", MINIO_SECRET_KEY: "b" };
const CORE = { CORE_API_KEY: "fk_abc", CORE_WEBHOOK_SECRET: "whsec_x" };

test("o Pix exige a chave fk_ e o segredo whsec_ do Core", () => {
  assert.throws(() => parseEnv(BASE));
  assert.throws(() => parseEnv({ ...BASE, CORE_API_KEY: "fk_abc" }));
  assert.throws(() => parseEnv({ ...BASE, CORE_WEBHOOK_SECRET: "whsec_x" }));
  assert.throws(() => parseEnv({ ...BASE, CORE_API_KEY: "abc", CORE_WEBHOOK_SECRET: "whsec_x" }));
  assert.throws(() => parseEnv({ ...BASE, CORE_API_KEY: "fk_abc", CORE_WEBHOOK_SECRET: "segredo" }));

  const env = parseEnv({ ...BASE, ...CORE });

  assert.equal(env.CORE_API_URL, "https://felipepasc.com");
  assert.equal(env.CORE_API_KEY, "fk_abc");
});

test("CORE_API_URL precisa ser um endereço", () => {
  assert.throws(() => parseEnv({ ...BASE, ...CORE, CORE_API_URL: "felipepasc" }));
  assert.equal(parseEnv({ ...BASE, ...CORE, CORE_API_URL: "http://localhost:6600" }).CORE_API_URL, "http://localhost:6600");
});
