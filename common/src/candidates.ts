export type Candidate = {
  id: string;
  name: string;
  number: string;
  colors: [string, string, string];
};

export const CANDIDATES: readonly Candidate[] = [
  { id: "lula", name: "LULA", number: "13", colors: ["#d81f26", "#ffffff", "#f5c400"] },
  { id: "flavio-bolsonaro", name: "FLÁVIO BOLSONARO", number: "22", colors: ["#0b3d91", "#f5c400", "#1a8f3c"] },
  { id: "ronaldo-caiado", name: "RONALDO CAIADO", number: "55", colors: ["#0f7a3a", "#f5c400", "#0b3d91"] },
  { id: "zema", name: "ZEMA", number: "30", colors: ["#f26a1b", "#f5c400", "#ffffff"] },
  { id: "samara", name: "SAMARA", number: "80", colors: ["#7b2cbf", "#e83e8c", "#ffffff"] },
  { id: "augusto-cury", name: "AUGUSTO CURY", number: "70", colors: ["#1d3f9e", "#f5c400", "#0f172a"] },
];

export function findCandidate(id: string): Candidate | undefined {
  return CANDIDATES.find((candidate) => candidate.id === id);
}
