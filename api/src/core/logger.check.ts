import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createLogger } from "@/core/logger";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });

  return { lines, logger: createLogger(stream) };
}

test("erro de consulta do banco é logado sem query nem parâmetros", () => {
  const { lines, logger } = capture();
  const error = Object.assign(new Error("Failed query: insert into orders values ($1)\nparams: 203.0.113.9,000201-abc,photos/x.jpg"), {
    params: ["203.0.113.9", "000201-abc", "photos/x.jpg"],
    query: "insert into orders",
    cause: Object.assign(new Error("duplicate key (pix_id)=(pix_1)"), { code: "23505" }),
  });

  logger.error({ err: error }, "falhou");
  const text = lines.join("");

  for (const secret of ["203.0.113.9", "000201-abc", "photos/x.jpg", "Failed query", "pix_1", "insert into"]) {
    assert.equal(text.includes(secret), false, secret);
  }

  assert.ok(text.includes("Falha em consulta ao banco"));
  assert.ok(text.includes("23505"));
});

test("erro comum mantém a mensagem mas troca chaves do storage por [chave]", () => {
  const { lines, logger } = capture();

  logger.error({ err: new Error("Objeto não encontrado: photos/abc.jpg e results/abc.png") }, "falhou");
  const text = lines.join("");

  assert.ok(text.includes("Objeto não encontrado"));
  assert.ok(text.includes("[chave]"));
  assert.equal(text.includes("photos/abc"), false);
  assert.equal(text.includes("results/abc"), false);
});
