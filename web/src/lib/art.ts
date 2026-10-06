import type { Candidate } from "@moldura/common";

// Ilustrações estilizadas geradas por IA e aprovadas, em web/public/art/<id>.webp (640×640).
// Ao aprovar uma nova ilustração, copie o arquivo e acrescente o id aqui.
export const ART_IDS: readonly string[] = ["lula", "flavio-bolsonaro"];

// Topo da home: pessoas FICTÍCIAS (ilustrações geradas por IA) na moldura de exemplo "SEU CANDIDATO" / 00.
// Ficam fora de ART_IDS: não são candidatos.
export const EXAMPLE_FRAME_ID = "exemplo";

export type HeroArt = { id: string; src: string; alt: string };

export const HERO_ART: readonly HeroArt[] = [1, 2, 3].map((index) => ({
  id: `hero-${index}`,
  src: `/art/hero-${index}.webp`,
  alt: "Ilustração estilizada, gerada por IA, de uma pessoa fictícia com a moldura de exemplo",
}));

export const AI_NOTE = "Ilustrações geradas por IA, estilizadas — não são fotos nem material oficial das campanhas.";

export function hasArt(id: string): boolean {
  return ART_IDS.includes(id);
}

export function artSrc(id: string): string | null {
  if (!hasArt(id)) {
    return null;
  }

  return `/art/${id}.webp`;
}

// Moldura reduzida (WebP 480 px, gerada por scripts/sync-frames.mjs) para a home; o /criar usa o PNG de 1080 px.
export function frameSrc(id: string): string {
  return `/frames/${id}.webp`;
}

export function withArt(candidates: readonly Candidate[]): Candidate[] {
  return candidates.filter((candidate) => hasArt(candidate.id));
}

const LOWER_WORDS = new Set(["da", "das", "de", "do", "dos", "e"]);

export function displayName(name: string): string {
  return name
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word, index) => {
      if (index > 0 && LOWER_WORDS.has(word)) {
        return word;
      }

      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}
