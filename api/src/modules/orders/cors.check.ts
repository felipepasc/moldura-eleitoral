import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "@/scripts/fixtures/test-app";
import type { TestApp } from "@/scripts/fixtures/test-app";

let t: TestApp;

afterEach(async () => {
  await t.close();
});

async function allowedOrigin(origin: string) {
  const res = await t.app.inject({ method: "GET", url: "/healthz", headers: { origin } });

  return res.headers["access-control-allow-origin"];
}

test("WEB_ORIGIN aceita lista separada por vírgula, normalizada, e só ela", async () => {
  t = await createTestApp({ webOrigin: " https://molduraeleitoral.com/ , https://www.molduraeleitoral.com " });

  assert.equal(await allowedOrigin("https://molduraeleitoral.com"), "https://molduraeleitoral.com");
  assert.equal(await allowedOrigin("https://www.molduraeleitoral.com"), "https://www.molduraeleitoral.com");
  assert.equal(await allowedOrigin("https://evil.example.com"), undefined);
  assert.equal(await allowedOrigin("http://molduraeleitoral.com"), undefined);
  assert.equal(await allowedOrigin("https://molduraeleitoral.com.evil.com"), undefined);
});

test("WEB_ORIGIN com uma origem só continua funcionando", async () => {
  t = await createTestApp();

  assert.equal(await allowedOrigin("http://localhost:6610"), "http://localhost:6610");
  assert.equal(await allowedOrigin("http://localhost:6611"), undefined);
});
