import type { Candidate } from "@moldura/common";

// Ordem alfabética para exibição (home e /criar); CANDIDATES em common mantém a ordem original.
export function sortCandidatesAlphabetically(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }));
}
