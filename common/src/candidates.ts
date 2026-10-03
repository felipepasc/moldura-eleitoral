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

// ATENÇÃO: a lista de candidatos a presidente veio de reportagens (Agência Brasil, Gazeta do Povo,
// O Tempo, CNN Brasil), pois o site do TSE bloqueou a consulta automatizada em 03/10/2026.
// Conferir no DivulgaCand antes de publicar. Leonardo Avalanche (PRTB) desistiu e ficou de fora.
// Governadores: acrescentar entradas com office "governador" e state (a lista vem depois).
const INPUTS: readonly CandidateInput[] = [
  { id: "lula", name: "LULA", frameName: "LULA", number: "13", office: "presidente", partyAcronym: "PT", vice: "Geraldo Alckmin" },
  { id: "flavio-bolsonaro", name: "FLÁVIO BOLSONARO", frameName: "FLÁVIO BOLSONARO", number: "22", office: "presidente", partyAcronym: "PL", vice: "Alfredo Gaspar" },
  { id: "zema", name: "ZEMA", frameName: "ZEMA", number: "30", office: "presidente", partyAcronym: "NOVO", vice: "Eduardo Girão" },
  { id: "ronaldo-caiado", name: "RONALDO CAIADO", frameName: "RONALDO CAIADO", number: "55", office: "presidente", partyAcronym: "PSD", vice: "Gilberto Kassab" },
  { id: "renan-santos", name: "RENAN SANTOS", frameName: "RENAN SANTOS", number: "14", office: "presidente", partyAcronym: "MISSÃO", vice: "Aroldo Medina" },
  { id: "augusto-cury", name: "AUGUSTO CURY", frameName: "AUGUSTO CURY", number: "70", office: "presidente", partyAcronym: "AVANTE", vice: "Julio Delgado" },
  { id: "clariana-barao", name: "CLARIANA BARÃO", frameName: "CLARIANA BARÃO", number: "27", office: "presidente", partyAcronym: "DC", vice: "Fabiana Torquato" },
  { id: "edmilson-costa", name: "EDMILSON COSTA", frameName: "EDMILSON COSTA", number: "21", office: "presidente", partyAcronym: "PCB", vice: "Cleusa Santos" },
  { id: "hertz-dias", name: "HERTZ DIAS", frameName: "HERTZ DIAS", number: "16", office: "presidente", partyAcronym: "PSTU", vice: "Vanessa Portugal" },
  { id: "samara", name: "SAMARA", frameName: "SAMARA", number: "80", office: "presidente", partyAcronym: "UP", vice: "Raquel Brício" },
  { id: "rui-costa-pimenta", name: "RUI COSTA PIMENTA", frameName: "RUI COSTA PIMENTA", number: "29", office: "presidente", partyAcronym: "PCO", vice: "Antonio Carlos Silva" },
  { id: "wilson-grassi", name: "WILSON GRASSI", frameName: "WILSON GRASSI", number: "35", office: "presidente", partyAcronym: "DEMOCRATA", vice: "Sued Haidar" },
];

export const CANDIDATES: readonly Candidate[] = INPUTS.map(withPartyColors);

export function findCandidate(id: string): Candidate | undefined {
  return CANDIDATES.find((candidate) => candidate.id === id);
}

export function candidatesBy(office: Office, state?: StateCode): Candidate[] {
  return CANDIDATES.filter((candidate) => candidate.office === office && (state === undefined || candidate.state === state));
}
