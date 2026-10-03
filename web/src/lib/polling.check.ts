import assert from "node:assert/strict";
import { test } from "node:test";
import { EXTRA_EXPIRED_POLLS, nextDelay, parseRetryAfter, qrSource, retryDelay, shouldKeepPolling } from "./polling";

test("backoff 3s -> 6s -> 12s -> 15s e volta a 3s no sucesso", () => {
  assert.equal(nextDelay(3000, false), 6000);
  assert.equal(nextDelay(6000, false), 12000);
  assert.equal(nextDelay(12000, false), 15000);
  assert.equal(nextDelay(15000, false), 15000);
  assert.equal(nextDelay(15000, true), 3000);
});

test("qrSource só aceita data:image/", () => {
  assert.equal(qrSource("data:image/png;base64,AAA"), "data:image/png;base64,AAA");
  assert.equal(qrSource("data:text/html;base64,AAA"), "data:image/png;base64,data:text/html;base64,AAA");
  assert.equal(qrSource("AAA"), "data:image/png;base64,AAA");
});

const NOW = Date.parse("2026-10-03T12:00:00Z");

test("Retry-After em segundos vira ms, limitado a 1–120 s", () => {
  assert.equal(parseRetryAfter("30", NOW), 30_000);
  assert.equal(parseRetryAfter("0", NOW), 1_000);
  assert.equal(parseRetryAfter("9999", NOW), 120_000);
  assert.equal(parseRetryAfter(" 5 ", NOW), 5_000);
});

test("Retry-After como data HTTP", () => {
  assert.equal(parseRetryAfter("Sat, 03 Oct 2026 12:00:20 GMT", NOW), 20_000);
  assert.equal(parseRetryAfter("Sat, 03 Oct 2026 11:00:00 GMT", NOW), 1_000);
  assert.equal(parseRetryAfter("Sun, 04 Oct 2026 12:00:00 GMT", NOW), 120_000);
});

test("Retry-After ausente ou inválido é undefined", () => {
  assert.equal(parseRetryAfter(null, NOW), undefined);
  assert.equal(parseRetryAfter("", NOW), undefined);
  assert.equal(parseRetryAfter("amanhã", NOW), undefined);
  assert.equal(parseRetryAfter("-5", NOW), undefined);
  assert.equal(parseRetryAfter("1.5", NOW), undefined);
});

test("retryDelay usa o maior entre o backoff e o Retry-After", () => {
  assert.equal(retryDelay(6000, 30_000), 30_000);
  assert.equal(retryDelay(12_000, 2_000), 12_000);
  assert.equal(retryDelay(6000, undefined), 6000);
});

test("depois do primeiro expired, consulta mais 3 vezes antes de parar", () => {
  assert.equal(shouldKeepPolling("pending", 0), true);
  assert.equal(shouldKeepPolling("paid_failed", 0), true);
  assert.equal(shouldKeepPolling("paid", 0), false);
  assert.equal(shouldKeepPolling("expired", 1), true);
  assert.equal(shouldKeepPolling("expired", 3), true);
  assert.equal(shouldKeepPolling("expired", EXTRA_EXPIRED_POLLS + 1), false);
  assert.equal(EXTRA_EXPIRED_POLLS, 3);
});
