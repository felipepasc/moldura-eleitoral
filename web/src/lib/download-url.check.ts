import assert from "node:assert/strict";
import { test } from "node:test";
import { safeDownloadUrl } from "./download-url";

const ORIGIN = "http://localhost:9300";

test("aceita http/https da origem configurada", () => {
  assert.equal(safeDownloadUrl("http://localhost:9300/moldura/results/a.png?X-Amz=1", ORIGIN), "http://localhost:9300/moldura/results/a.png?X-Amz=1");
  assert.equal(safeDownloadUrl("https://files.exemplo.com.br/a.png", "https://files.exemplo.com.br"), "https://files.exemplo.com.br/a.png");
});

test("rejeita origem diferente (localhost != 127.0.0.1)", () => {
  assert.equal(safeDownloadUrl("http://127.0.0.1:9300/a.png", ORIGIN), null);
  assert.equal(safeDownloadUrl("https://evil.example/a.png", ORIGIN), null);
});

test("rejeita protocolos que não são http/https", () => {
  assert.equal(safeDownloadUrl("javascript:alert(1)", undefined), null);
  assert.equal(safeDownloadUrl("data:image/png;base64,AAA", undefined), null);
  assert.equal(safeDownloadUrl("file:///etc/passwd", undefined), null);
});

test("rejeita texto que não é URL", () => {
  assert.equal(safeDownloadUrl("", ORIGIN), null);
  assert.equal(safeDownloadUrl("não é url", ORIGIN), null);
});

test("sem origem configurada, aceita qualquer http/https", () => {
  assert.equal(safeDownloadUrl("https://x.example/a.png", undefined), "https://x.example/a.png");
  assert.equal(safeDownloadUrl("https://x.example/a.png", ""), "https://x.example/a.png");
});
