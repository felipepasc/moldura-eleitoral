import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPrice, operatorInfo, operatorLine } from "./site";

test("operatorInfo só existe com nome e e-mail válidos", () => {
  assert.deepEqual(operatorInfo(" Fulano de Tal ", " contato@exemplo.com.br "), { name: "Fulano de Tal", email: "contato@exemplo.com.br", doc: "" });
  assert.equal(operatorInfo(undefined, "contato@exemplo.com.br"), null);
  assert.equal(operatorInfo("Fulano", undefined), null);
  assert.equal(operatorInfo("", ""), null);
  assert.equal(operatorInfo("Fulano", "não-é-email"), null);
  assert.equal(operatorInfo("Fulano", "a@b"), null);
  assert.equal(operatorInfo("Fulano", "<script>@x.com"), null);
});

test("operatorLine junta nome, documento e e-mail; sem documento, só nome e e-mail", () => {
  assert.equal(
    operatorLine(operatorInfo("FELIPE PASCHOAL BERGAMO SOFTWARES", "contato@felipepasc.com", "CNPJ 61.539.666/0001-07")),
    "FELIPE PASCHOAL BERGAMO SOFTWARES · CNPJ 61.539.666/0001-07 · contato@felipepasc.com",
  );
  assert.equal(operatorLine(operatorInfo("Fulano", "contato@exemplo.com.br", undefined)), "Fulano · contato@exemplo.com.br");
  assert.equal(operatorLine(operatorInfo("Fulano", "contato@exemplo.com.br", "  ")), "Fulano · contato@exemplo.com.br");
  assert.equal(operatorLine(null), "");
});

test("formatPrice usa reais", () => {
  assert.equal(formatPrice(399).replace(/\s/g, " "), "R$ 3,99");
});
