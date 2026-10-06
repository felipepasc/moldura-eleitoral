import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSiteStatus, parseSiteStatus } from "./sales";

test("parseSiteStatus: vendas só fecham com false explícito; estilo do partido só aparece com true explícito", () => {
  assert.deepEqual(parseSiteStatus({ salesEnabled: false, partyStyleEnabled: true }), { salesOpen: false, partyStyleEnabled: true });
  assert.deepEqual(parseSiteStatus({ salesEnabled: true, partyStyleEnabled: false }), { salesOpen: true, partyStyleEnabled: false });
  assert.deepEqual(parseSiteStatus({ salesEnabled: true }), { salesOpen: true, partyStyleEnabled: false });
  assert.deepEqual(parseSiteStatus({}), { salesOpen: true, partyStyleEnabled: false });
  assert.deepEqual(parseSiteStatus(null), { salesOpen: true, partyStyleEnabled: false });
  assert.deepEqual(parseSiteStatus({ salesEnabled: "false", partyStyleEnabled: "true" }), { salesOpen: true, partyStyleEnabled: false });
  assert.deepEqual(parseSiteStatus("lixo"), { salesOpen: true, partyStyleEnabled: false });
});

test("loadSiteStatus consulta /public/status sem cache; erro = vendas abertas e estilo do partido escondido", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const closed = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });

    return new Response(JSON.stringify({ salesEnabled: false, partyStyleEnabled: true }), { status: 200, headers: { "content-type": "application/json" } });
  };

  assert.deepEqual(await loadSiteStatus("https://api.exemplo.com.br", closed), { salesOpen: false, partyStyleEnabled: true });
  assert.equal(calls[0].url, "https://api.exemplo.com.br/public/status");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[0].init?.referrerPolicy, "no-referrer");

  const failClosed = { salesOpen: true, partyStyleEnabled: false };
  const failing = async () => {
    throw new Error("rede");
  };
  const serverError = async () => new Response("erro", { status: 500 });
  const notJson = async () => new Response("<html>", { status: 200 });

  assert.deepEqual(await loadSiteStatus("https://api.exemplo.com.br", failing), failClosed);
  assert.deepEqual(await loadSiteStatus("https://api.exemplo.com.br", serverError), failClosed);
  assert.deepEqual(await loadSiteStatus("https://api.exemplo.com.br", notJson), failClosed);
});
