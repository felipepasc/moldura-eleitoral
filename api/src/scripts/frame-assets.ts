import sharp from "sharp";
import { FRAME_SIZE } from "@moldura/common";
import type { FrameHole } from "@moldura/common";

// Molduras curadas (arte pronta, de formato livre): o furo não é um círculo no centro.
// Daqui saem a moldura em 1080 px, a máscara da foto e a medida do furo.

const SIZE = FRAME_SIZE;
const OPAQUE = 128;
// Fecha frestas da arte (pinceladas, respingos) de até ~2x este valor antes de achar o lado de fora.
const CLOSE_PX = 12;
// A máscara termina este tanto para dentro da borda externa da arte: a foto nunca aparece por fora.
const INSET_PX = 4;
const MIN_POCKET_PIXELS = 400;
const POCKET_MARGIN_PX = 3;
// Abaixo disto o alfa é sujeira do recorte da arte e vira transparência total.
const NOISE_ALPHA = 16;

// Distância (chamfer 3-4, em pixels) de cada ponto até o ponto marcado mais próximo.
function distanceTo(marked: Uint8Array): Float32Array {
  const far = 1e9;
  const dist = new Float32Array(SIZE * SIZE);

  for (let index = 0; index < dist.length; index += 1) {
    dist[index] = marked[index] ? 0 : far;
  }

  const relax = (index: number, x: number, y: number, dx: number, dy: number, cost: number) => {
    const nx = x + dx;
    const ny = y + dy;

    if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
      const value = dist[ny * SIZE + nx] + cost;

      if (value < dist[index]) {
        dist[index] = value;
      }
    }
  };

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;

      relax(index, x, y, -1, 0, 3);
      relax(index, x, y, 0, -1, 3);
      relax(index, x, y, -1, -1, 4);
      relax(index, x, y, 1, -1, 4);
    }
  }

  for (let y = SIZE - 1; y >= 0; y -= 1) {
    for (let x = SIZE - 1; x >= 0; x -= 1) {
      const index = y * SIZE + x;

      relax(index, x, y, 1, 0, 3);
      relax(index, x, y, 0, 1, 3);
      relax(index, x, y, 1, 1, 4);
      relax(index, x, y, -1, 1, 4);
    }
  }

  for (let index = 0; index < dist.length; index += 1) {
    dist[index] /= 3;
  }

  return dist;
}

// Preenche, a partir das sementes, a região ligada por pontos livres (vizinhança de 4).
function flood(free: Uint8Array, seeds: number[]): Uint8Array {
  const reached = new Uint8Array(SIZE * SIZE);
  const stack: number[] = [];

  for (const seed of seeds) {
    if (free[seed] && !reached[seed]) {
      reached[seed] = 1;
      stack.push(seed);
    }
  }

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % SIZE;
    const neighbors = [index - SIZE, index + SIZE, x > 0 ? index - 1 : -1, x < SIZE - 1 ? index + 1 : -1];

    for (const next of neighbors) {
      if (next >= 0 && next < reached.length && free[next] && !reached[next]) {
        reached[next] = 1;
        stack.push(next);
      }
    }
  }

  return reached;
}

function borderSeeds(): number[] {
  const seeds: number[] = [];

  for (let step = 0; step < SIZE; step += 1) {
    seeds.push(step, (SIZE - 1) * SIZE + step, step * SIZE, step * SIZE + SIZE - 1);
  }

  return seeds;
}

async function alphaOf(frame: Buffer): Promise<Uint8Array> {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (info.width !== SIZE || info.height !== SIZE) {
    throw new Error(`moldura ${info.width}x${info.height}, esperado ${SIZE}x${SIZE}`);
  }

  const alpha = new Uint8Array(SIZE * SIZE);

  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = data[index * 4 + 3];
  }

  return alpha;
}

// 1 onde a foto pode aparecer: o furo e tudo o que fica debaixo da arte; 0 do lado de fora.
function insideOf(alpha: Uint8Array): Uint8Array {
  const opaque = new Uint8Array(alpha.length);

  for (let index = 0; index < alpha.length; index += 1) {
    opaque[index] = alpha[index] >= OPAQUE ? 1 : 0;
  }

  const toArt = distanceTo(opaque);
  const free = new Uint8Array(alpha.length);

  for (let index = 0; index < alpha.length; index += 1) {
    free[index] = toArt[index] > CLOSE_PX ? 1 : 0;
  }

  const outside = flood(free, borderSeeds());
  const toOutside = distanceTo(outside);
  const inside = new Uint8Array(alpha.length);

  for (let index = 0; index < alpha.length; index += 1) {
    inside[index] = toOutside[index] > CLOSE_PX + INSET_PX ? 1 : 0;
  }

  return inside;
}

type Region = { count: number; minX: number; maxX: number; minY: number; maxY: number; pixels: Uint8Array };

// Regiões transparentes do lado de dentro, da maior para a menor. A maior é o furo da foto.
function openRegions(alpha: Uint8Array, inside: Uint8Array): Region[] {
  const open = new Uint8Array(alpha.length);

  for (let index = 0; index < alpha.length; index += 1) {
    open[index] = inside[index] && alpha[index] < OPAQUE ? 1 : 0;
  }

  const seen = new Uint8Array(alpha.length);
  const regions: Region[] = [];

  for (let start = 0; start < open.length; start += 1) {
    if (!open[start] || seen[start]) {
      continue;
    }

    const pixels = flood(open, [start]);
    const region: Region = { count: 0, minX: SIZE, maxX: 0, minY: SIZE, maxY: 0, pixels };

    for (let index = 0; index < pixels.length; index += 1) {
      if (!pixels[index]) {
        continue;
      }

      seen[index] = 1;
      const x = index % SIZE;
      const y = (index - x) / SIZE;

      region.count += 1;
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minY = Math.min(region.minY, y);
      region.maxY = Math.max(region.maxY, y);
    }

    regions.push(region);
  }

  return regions.sort((first, second) => second.count - first.count);
}

// Quadrado que cobre o furo, em frações do lado.
function holeOf(region: Region): FrameHole {
  const round = (value: number) => Math.round(value * 1000) / 1000;

  return {
    cx: round((region.minX + region.maxX + 1) / 2 / SIZE),
    cy: round((region.minY + region.maxY + 1) / 2 / SIZE),
    r: round(Math.max(region.maxX - region.minX + 1, region.maxY - region.minY + 1) / 2 / SIZE),
  };
}

// Vãos transparentes que não são o furo (entre enfeites da arte) ficam sem foto; os minúsculos não contam.
function withoutPockets(inside: Uint8Array, pockets: Region[]): Uint8Array {
  const marked = new Uint8Array(inside.length);

  for (const pocket of pockets) {
    if (pocket.count < MIN_POCKET_PIXELS) {
      continue;
    }

    for (let index = 0; index < marked.length; index += 1) {
      if (pocket.pixels[index]) {
        marked[index] = 1;
      }
    }
  }

  const toPocket = distanceTo(marked);
  const result = new Uint8Array(inside.length);

  for (let index = 0; index < result.length; index += 1) {
    result[index] = inside[index] && toPocket[index] > POCKET_MARGIN_PX ? 1 : 0;
  }

  return result;
}

export async function resizeFrame(source: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source).ensureAlpha().resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < NOISE_ALPHA) {
      data[index] = 0;
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

export async function measureFrame(frame: Buffer): Promise<{ hole: FrameHole; inside: Uint8Array; alpha: Uint8Array }> {
  const alpha = await alphaOf(frame);
  const reach = insideOf(alpha);
  const [hole, ...pockets] = openRegions(alpha, reach);

  if (!hole) {
    throw new Error("a moldura não tem furo para a foto");
  }

  return { hole: holeOf(hole), inside: withoutPockets(reach, pockets), alpha };
}

// Máscara da foto: PNG branco cujo canal alfa diz onde a foto aparece (borda levemente suavizada).
export async function buildMask(inside: Uint8Array): Promise<Buffer> {
  const gray = Buffer.alloc(SIZE * SIZE);

  for (let index = 0; index < gray.length; index += 1) {
    gray[index] = inside[index] ? 255 : 0;
  }

  const soft = await sharp(gray, { raw: { width: SIZE, height: SIZE, channels: 1 } }).blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 255);

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    rgba[index * 4 + 3] = soft.data[index * soft.info.channels];
  }

  return sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

export function maskFileName(frameFile: string): string {
  return `masks/${frameFile}`;
}
