import { test } from "node:test";
import { Writable } from "node:stream";
import assert from "node:assert/strict";
import { createLogger } from "@/core/logger";
import { createMinioStorage } from "@/core/storage";
import type { StorageClient, StorageConfig } from "@/core/storage";

const R2_CONFIG: StorageConfig = {
  endpoint: "0123456789abcdef.r2.cloudflarestorage.com",
  port: 443,
  useSSL: true,
  region: "auto",
  accessKey: "AKIAEXAMPLE",
  secretKey: "example-secret-key",
  bucket: "moldura-prod",
};

function capture() {
  let text = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });

  return { logger: createLogger(stream), text: () => text };
}

function fakeClient(overrides: Partial<StorageClient> = {}): StorageClient & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async bucketExists() {
      calls.push("bucketExists");

      return true;
    },
    async makeBucket() {
      calls.push("makeBucket");
    },
    async setBucketLifecycle() {
      calls.push("setBucketLifecycle");
    },
    async putObject() {
      return { etag: "x", versionId: null };
    },
    async getObject() {
      throw new Error("não usado");
    },
    async removeObject() {},
    async presignedGetObject() {
      return "";
    },
    ...overrides,
  } as StorageClient & { calls: string[] };
}

test("link assinado para o R2 usa path-style, região auto e https sem porta", async () => {
  const storage = createMinioStorage(R2_CONFIG);

  const url = new URL(await storage.signedUrl("results/abc.png", 600));

  assert.equal(url.protocol, "https:");
  assert.equal(url.host, "0123456789abcdef.r2.cloudflarestorage.com");
  assert.equal(url.pathname, "/moldura-prod/results/abc.png");
  assert.match(url.searchParams.get("X-Amz-Credential") ?? "", /^AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.ok(url.searchParams.get("X-Amz-Signature"));
  assert.match(url.searchParams.get("response-content-disposition") ?? "", /attachment/);
});

test("ensureBucket com bucket existente não tenta criar e aplica o ciclo de vida", async () => {
  const client = fakeClient();
  const { logger } = capture();

  await createMinioStorage({ ...R2_CONFIG, logger }, client).ensureBucket();

  assert.deepEqual(client.calls, ["bucketExists", "setBucketLifecycle"]);
});

test("ensureBucket cria o bucket só quando falta", async () => {
  const client = fakeClient();
  client.bucketExists = async () => false;

  await createMinioStorage({ ...R2_CONFIG, logger: capture().logger }, client).ensureBucket();

  assert.deepEqual(client.calls, ["makeBucket", "setBucketLifecycle"]);
});

test("falha ao criar o bucket loga claro e relança", async () => {
  const log = capture();
  const client = fakeClient({
    async bucketExists() {
      return false;
    },
    async makeBucket() {
      throw Object.assign(new Error("AccessDenied"), { code: "AccessDenied" });
    },
  });

  await assert.rejects(createMinioStorage({ ...R2_CONFIG, logger: log.logger }, client).ensureBucket(), /AccessDenied/);

  assert.match(log.text(), /Não consegui criar o bucket/);
  assert.ok(!log.text().includes("moldura-prod"));
});

test("falha no ciclo de vida só avisa e não derruba a subida", async () => {
  const log = capture();
  const client = fakeClient({
    async setBucketLifecycle() {
      throw Object.assign(new Error("NotImplemented"), { code: "NotImplemented" });
    },
  });

  await createMinioStorage({ ...R2_CONFIG, logger: log.logger }, client).ensureBucket();

  assert.match(log.text(), /Não consegui configurar a expiração automática do bucket/);
});
