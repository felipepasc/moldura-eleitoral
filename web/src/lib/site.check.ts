import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPrice, operatorInfo } from "./site";

test("operatorInfo só existe com nome e e-mail válidos", () => {
  assert.deepEqual(operatorInfo(" Fulano de Tal ", " contato@exemplo.com.br "), { name: "Fulano de Tal", email: "contato@exemplo.com.br" });
  assert.equal(operatorInfo(undefined, "contato@exemplo.com.br"), null);
  assert.equal(operatorInfo("Fulano", undefined), null);
  assert.equal(operatorInfo("", ""), null);
  assert.equal(operatorInfo("Fulano", "não-é-email"), null);
  assert.equal(operatorInfo("Fulano", "a@b"), null);
  assert.equal(operatorInfo("Fulano", "<script>@x.com"), null);
});

test("formatPrice usa reais", () => {
  assert.equal(formatPrice(399).replace(/\s/g, " "), "R$ 3,99");
});
