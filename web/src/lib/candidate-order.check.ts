import assert from "node:assert/strict";
import { test } from "node:test";
import { CANDIDATES } from "@moldura/common";
import type { Candidate } from "@moldura/common";
import { sortCandidatesAlphabetically } from "./candidate-order";

test("ordena por nome em pt-BR, sem diferenciar acento e caixa", () => {
  const names = sortCandidatesAlphabetically(CANDIDATES).map((candidate) => candidate.name);

  assert.equal(names.length, CANDIDATES.length);
  assert.deepEqual(names, ["FLÁVIO BOLSONARO", "LULA"]);
});

test("acento e caixa não mudam a ordem", () => {
  const make = (id: string, name: string) => ({ ...CANDIDATES[0], id, name }) as Candidate;
  const sorted = sortCandidatesAlphabetically([make("b", "élio"), make("c", "Fábio"), make("a", "ana"), make("d", "Edu")]);

  assert.deepEqual(sorted.map((candidate) => candidate.id), ["a", "d", "b", "c"]);
});

test("não altera a lista recebida", () => {
  const before = CANDIDATES.map((candidate) => candidate.id);

  sortCandidatesAlphabetically(CANDIDATES);
  assert.deepEqual(CANDIDATES.map((candidate) => candidate.id), before);
});
