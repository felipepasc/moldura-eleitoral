import assert from "node:assert/strict";
import { test } from "node:test";
import { isCaptureShortcut } from "./protection";

const key = (value: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: value, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

test("PrintScreen (com ou sem Alt) é atalho de captura", () => {
  assert.equal(isCaptureShortcut(key("PrintScreen")), true);
  assert.equal(isCaptureShortcut(key("PrintScreen", { altKey: true })), true);
});

test("Win/Cmd + Shift + S/3/4/5 são atalhos de captura", () => {
  for (const value of ["s", "S", "3", "4", "5", "#", "$", "%"]) {
    assert.equal(isCaptureShortcut(key(value, { metaKey: true, shiftKey: true })), true, value);
  }
});

test("atalhos comuns não disparam (setas, Ctrl+Shift+S, Cmd+S, Shift+S, letras)", () => {
  assert.equal(isCaptureShortcut(key("ArrowLeft")), false);
  assert.equal(isCaptureShortcut(key("s", { ctrlKey: true, shiftKey: true })), false);
  assert.equal(isCaptureShortcut(key("s", { metaKey: true })), false);
  assert.equal(isCaptureShortcut(key("S", { shiftKey: true })), false);
  assert.equal(isCaptureShortcut(key("6", { metaKey: true, shiftKey: true })), false);
  assert.equal(isCaptureShortcut(key("a")), false);
  assert.equal(isCaptureShortcut(key("Enter")), false);
});
