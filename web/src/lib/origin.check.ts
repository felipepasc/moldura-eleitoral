import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_IMAGES_ORIGIN, normalizeOrigin } from "./origin";

test("normaliza barra final, caixa do host, porta padrão e caminho", () => {
  assert.equal(normalizeOrigin("http://localhost:9300/", DEFAULT_IMAGES_ORIGIN), "http://localhost:9300");
  assert.equal(normalizeOrigin("HTTPS://Files.Exemplo.com.br", DEFAULT_IMAGES_ORIGIN), "https://files.exemplo.com.br");
  assert.equal(normalizeOrigin("https://files.exemplo.com.br:443", DEFAULT_IMAGES_ORIGIN), "https://files.exemplo.com.br");
  assert.equal(normalizeOrigin("http://files.exemplo.com.br:80", DEFAULT_IMAGES_ORIGIN), "http://files.exemplo.com.br");
  assert.equal(normalizeOrigin("http://localhost:9300/bucket/x?y=1", DEFAULT_IMAGES_ORIGIN), "http://localhost:9300");
});

test("porta que não é a padrão do protocolo é mantida", () => {
  assert.equal(normalizeOrigin("https://x.example:80", DEFAULT_IMAGES_ORIGIN), "https://x.example:80");
});

test("undefined usa o padrão; vazio, lixo e outros protocolos viram vazio", () => {
  assert.equal(normalizeOrigin(undefined, DEFAULT_IMAGES_ORIGIN), "http://localhost:9300");
  assert.equal(normalizeOrigin("", DEFAULT_IMAGES_ORIGIN), "");
  assert.equal(normalizeOrigin("não é url", DEFAULT_IMAGES_ORIGIN), "");
  assert.equal(normalizeOrigin("javascript:alert(1)", DEFAULT_IMAGES_ORIGIN), "");
  assert.equal(normalizeOrigin("file:///x", DEFAULT_IMAGES_ORIGIN), "");
  assert.equal(normalizeOrigin("data:image/png;base64,AAA", DEFAULT_IMAGES_ORIGIN), "");
});
