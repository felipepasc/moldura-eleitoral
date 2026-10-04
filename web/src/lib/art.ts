import type { Candidate } from "@moldura/common";

// Ilustrações estilizadas geradas por IA e aprovadas, em web/public/art/<id>.webp (640×640).
// Ao aprovar uma nova ilustração, copie o arquivo e acrescente o id aqui.
export const ART_IDS: readonly string[] = [
  "lula",
  "flavio-bolsonaro",
  "zema",
  "ronaldo-caiado",
  "samara",
  "augusto-cury",
  "renan-santos",
  "clariana-barao",
  "edmilson-costa",
  "hertz-dias",
  "rui-costa-pimenta",
  "wilson-grassi",
];

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

function channel(value: number): number {
  const scaled = value / 255;

  if (scaled <= 0.04045) {
    return scaled / 12.92;
  }

  return ((scaled + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) {
    return 0;
  }

  const value = Number.parseInt(match[1], 16);

  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (light + 0.05) / (dark + 0.05);
}

export const INK = "#0f172a";

export function readableText(background: string): string {
  if (contrastRatio(background, "#ffffff") >= contrastRatio(background, INK)) {
    return "#ffffff";
  }

  return INK;
}

function darken(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((part) => Math.round(part * (1 - amount)));

  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

// Cor de fundo e de texto com contraste AA (4,5:1). Se nem branco nem tinta escura alcançam 4,5:1
// sobre a cor do partido, a cor é escurecida aos poucos (só o necessário) e o texto fica branco.
export function swatch(color: string): { background: string; text: string } {
  const background = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#475569";
  const text = readableText(background);

  if (contrastRatio(background, text) >= 4.5) {
    return { background, text };
  }

  for (let amount = 0.04; amount < 1; amount += 0.04) {
    const darker = darken(background, amount);

    if (contrastRatio(darker, "#ffffff") >= 4.5) {
      return { background: darker, text: "#ffffff" };
    }
  }

  return { background: INK, text: "#ffffff" };
}
