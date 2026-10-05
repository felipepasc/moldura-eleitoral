import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSalesStatus, parseSalesStatus } from "./sales";

test("parseSalesStatus: só um false explícito fecha as vendas", () => {
  assert.equal(parseSalesStatus({ salesEnabled: false }), false);
  assert.equal(parseSalesStatus({ salesEnabled: true }), true);
  assert.equal(parseSalesStatus({}), true);
  assert.equal(parseSalesStatus(null), true);
  assert.equal(parseSalesStatus({ salesEnabled: "false" }), true);
  assert.equal(parseSalesStatus("lixo"), true);
});

test("loadSalesStatus consulta /public/status sem cache e trata erro como aberto", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const closed = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });

    return new Response(JSON.stringify({ salesEnabled: false }), { status: 200, headers: { "content-type": "application/json" } });
  };

  assert.equal(await loadSalesStatus("https://api.exemplo.com.br", closed), false);
  assert.equal(calls[0].url, "https://api.exemplo.com.br/public/status");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[0].init?.referrerPolicy, "no-referrer");

  const open = async () => new Response(JSON.stringify({ salesEnabled: true }), { status: 200 });
  const failing = async () => {
    throw new Error("rede");
  };
  const serverError = async () => new Response("erro", { status: 500 });
  const notJson = async () => new Response("<html>", { status: 200 });

  assert.equal(await loadSalesStatus("https://api.exemplo.com.br", open), true);
  assert.equal(await loadSalesStatus("https://api.exemplo.com.br", failing), true);
  assert.equal(await loadSalesStatus("https://api.exemplo.com.br", serverError), true);
  assert.equal(await loadSalesStatus("https://api.exemplo.com.br", notJson), true);
});
