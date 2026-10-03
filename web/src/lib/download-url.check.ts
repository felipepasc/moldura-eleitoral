import assert from "node:assert/strict";
import { test } from "node:test";
import { decideDownload, safeDownloadUrl } from "./download-url";

const ORIGIN = "http://localhost:9300";
const URL_OK = "http://localhost:9300/moldura/results/a.png?X-Amz=1";

test("aceita http/https da origem configurada", () => {
  assert.equal(safeDownloadUrl(URL_OK, ORIGIN), URL_OK);
  assert.equal(safeDownloadUrl("https://files.exemplo.com.br/a.png", "https://files.exemplo.com.br"), "https://files.exemplo.com.br/a.png");
});

test("a origem configurada é normalizada (barra final, caixa, porta padrão, caminho)", () => {
  assert.equal(safeDownloadUrl(URL_OK, "http://localhost:9300/"), URL_OK);
  assert.equal(safeDownloadUrl(URL_OK, "HTTP://LocalHost:9300"), URL_OK);
  assert.equal(safeDownloadUrl(URL_OK, "http://localhost:9300/bucket/"), URL_OK);
  assert.equal(safeDownloadUrl("https://f.example/a.png", "https://f.example:443/"), "https://f.example/a.png");
  assert.equal(safeDownloadUrl("http://f.example/a.png", "http://f.example:80"), "http://f.example/a.png");
});

test("rejeita origem diferente (localhost != 127.0.0.1)", () => {
  assert.equal(safeDownloadUrl("http://127.0.0.1:9300/a.png", ORIGIN), null);
  assert.equal(safeDownloadUrl("https://evil.example/a.png", ORIGIN), null);
});

test("rejeita protocolos que não são http/https", () => {
  assert.equal(safeDownloadUrl("javascript:alert(1)", ORIGIN), null);
  assert.equal(safeDownloadUrl("data:image/png;base64,AAA", ORIGIN), null);
  assert.equal(safeDownloadUrl("file:///etc/passwd", ORIGIN), null);
});

test("rejeita texto que não é URL", () => {
  assert.equal(safeDownloadUrl("", ORIGIN), null);
  assert.equal(safeDownloadUrl("não é url", ORIGIN), null);
});

test("origem configurada vazia ou inválida recusa tudo (como o CSP)", () => {
  assert.equal(safeDownloadUrl(URL_OK, ""), null);
  assert.equal(safeDownloadUrl(URL_OK, "lixo"), null);
  assert.equal(safeDownloadUrl(URL_OK, undefined), null);
});

test("decideDownload: link ok", () => {
  assert.deepEqual(decideDownload("paid", URL_OK, ORIGIN), { kind: "ok", url: URL_OK });
});

test("decideDownload: só status da api manda remover", () => {
  assert.deepEqual(decideDownload("pending", URL_OK, ORIGIN), { kind: "remove" });
  assert.deepEqual(decideDownload("paid", null, ORIGIN), { kind: "remove" });
  assert.deepEqual(decideDownload("paid_failed", null, ORIGIN), { kind: "remove" });
});

test("decideDownload: link inutilizável NÃO remove (fica indisponível)", () => {
  assert.deepEqual(decideDownload("paid", "http://127.0.0.1:9300/a.png", ORIGIN), { kind: "unavailable" });
  assert.deepEqual(decideDownload("paid", "javascript:alert(1)", ORIGIN), { kind: "unavailable" });
  assert.deepEqual(decideDownload("paid", URL_OK, ""), { kind: "unavailable" });
});
