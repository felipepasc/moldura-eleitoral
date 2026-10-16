import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SALES_BLACKOUT, isInBlackout, parseBlackout } from "@/core/blackout";
import { parseEnv } from "@/core/env";

const BASE = { DATABASE_URL: "x", MINIO_ACCESS_KEY: "a", MINIO_SECRET_KEY: "b", CORE_API_KEY: "fk_abc", CORE_WEBHOOK_SECRET: "whsec_x" };
const at = (iso: string) => new Date(iso);

test("o padrão cobre o dia da eleição do 2º turno em -03:00, início inclusivo e fim exclusivo", () => {
  const windows = parseBlackout(DEFAULT_SALES_BLACKOUT);

  assert.equal(isInBlackout(windows, at("2026-10-24T23:59:59-03:00")), false);
  assert.equal(isInBlackout(windows, at("2026-10-25T00:00:00-03:00")), true);
  assert.equal(isInBlackout(windows, at("2026-10-26T16:59:59-03:00")), true);
  assert.equal(isInBlackout(windows, at("2026-10-26T17:00:00-03:00")), false);
});

test("fusos diferentes descrevem o mesmo instante", () => {
  const windows = parseBlackout("2026-10-25T00:00:00-03:00/2026-10-26T17:00:00-03:00");

  assert.equal(isInBlackout(windows, at("2026-10-25T03:00:00Z")), true);
  assert.equal(isInBlackout(windows, at("2026-10-25T02:59:59Z")), false);
  assert.equal(isInBlackout(windows, at("2026-10-26T20:00:00Z")), false);
  assert.equal(isInBlackout(parseBlackout("2026-10-25T03:00:00Z/2026-10-25T04:00:00+00:00"), at("2026-10-25T03:30:00Z")), true);
});

test("vários intervalos, com espaços", () => {
  const windows = parseBlackout(" 2026-10-25T00:00:00-03:00/2026-10-25T12:00:00-03:00 , 2026-11-01T00:00:00-03:00/2026-11-01T06:00:00-03:00 ");

  assert.equal(windows.length, 2);
  assert.equal(isInBlackout(windows, at("2026-10-25T06:00:00-03:00")), true);
  assert.equal(isInBlackout(windows, at("2026-10-30T06:00:00-03:00")), false);
  assert.equal(isInBlackout(windows, at("2026-11-01T01:00:00-03:00")), true);
});

test("string vazia significa sem blackout", () => {
  assert.deepEqual(parseBlackout(""), []);
  assert.deepEqual(parseBlackout("   "), []);
  assert.equal(isInBlackout([], at("2026-10-25T12:00:00-03:00")), false);
});

test("valores inválidos falham com mensagem clara", () => {
  const invalid = [
    "2026-10-25/2026-10-26",
    "2026-10-25T00:00:00/2026-10-26T00:00:00",
    "2026-10-25T00:00:00-03:00",
    "2026-10-26T17:00:00-03:00/2026-10-25T00:00:00-03:00",
    "2026-10-25T00:00:00-03:00/2026-10-25T00:00:00-03:00",
    "ontem/amanhã",
    "2026-13-45T00:00:00-03:00/2026-13-46T00:00:00-03:00",
    "2026-10-25T00:00:00-03:00/2026-10-26T17:00:00-03:00,",
  ];

  for (const value of invalid) {
    assert.throws(() => parseBlackout(value), /SALES_BLACKOUT/, value);
  }
});

test("SALES_BLACKOUT no env: padrão quando ausente, vazio desliga, inválido derruba a subida", () => {
  assert.equal(parseEnv(BASE).SALES_BLACKOUT.length, 1);
  assert.deepEqual(parseEnv({ ...BASE, SALES_BLACKOUT: "" }).SALES_BLACKOUT, []);
  assert.equal(parseEnv({ ...BASE, SALES_BLACKOUT: "2026-10-25T00:00:00Z/2026-10-26T00:00:00Z" }).SALES_BLACKOUT.length, 1);
  assert.throws(() => parseEnv({ ...BASE, SALES_BLACKOUT: "lixo" }), /SALES_BLACKOUT/);
});
