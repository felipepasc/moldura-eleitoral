import assert from "node:assert/strict";
import { test } from "node:test";
import { nextDelay, qrSource } from "./polling";

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
