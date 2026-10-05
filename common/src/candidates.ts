import { findParty } from "./parties";
import type { StateCode } from "./states";

export type Office = "presidente" | "governador";

export type Candidate = {
  id: string;
  name: string;
  frameName: string;
  number: string;
  office: Office;
  state?: StateCode;
  partyAcronym: string;
  vice?: string;
  colors: [string, string, string];
};

type CandidateInput = Omit<Candidate, "colors">;

function withPartyColors(input: CandidateInput): Candidate {
  const party = findParty(input.partyAcronym);

  if (!party) {
    throw new Error(`Partido desconhecido: ${input.partyAcronym}`);
  }

  return { ...input, colors: [party.colors.primary, party.colors.secondary, party.colors.accent] };
}

// 2º turno das eleições 2026: o site oferece só os dois candidatos que disputam a presidência.
// Conferir no DivulgaCand antes de publicar. O modelo (office/state) segue pronto para outros cargos.
const INPUTS: readonly CandidateInput[] = [
  { id: "lula", name: "LULA", frameName: "LULA", number: "13", office: "presidente", partyAcronym: "PT", vice: "Geraldo Alckmin" },
  { id: "flavio-bolsonaro", name: "FLÁVIO BOLSONARO", frameName: "FLÁVIO BOLSONARO", number: "22", office: "presidente", partyAcronym: "PL", vice: "Alfredo Gaspar" },
];

export const CANDIDATES: readonly Candidate[] = INPUTS.map(withPartyColors);

export function findCandidate(id: string): Candidate | undefined {
  return CANDIDATES.find((candidate) => candidate.id === id);
}

export function candidatesBy(office: Office, state?: StateCode): Candidate[] {
  return CANDIDATES.filter((candidate) => candidate.office === office && (state === undefined || candidate.state === state));
}
