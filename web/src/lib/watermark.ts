// Geometria da marca d'água da prévia: ladrilhos de texto em duas grades giradas (−30° e +30°)
// que se cruzam. Os testes garantem que nenhum recorte de 15% × 15% da prévia escapa dela,
// considerando a extensão do texto (linha de base de cada ladrilho), não só o centro.

export type WatermarkTile = { x: number; y: number; angle: number; row: number; halfWidth: number };

export const WATERMARK_BASE_SIZE = 540;
export const WATERMARK_ANGLES: readonly number[] = [-Math.PI / 6, Math.PI / 6];
// Espaçamentos para a prévia de 540 px; em outros tamanhos escalam junto.
export const WATERMARK_STEP_X = 200;
export const WATERMARK_STEP_Y = 52;
// Meia largura (conservadora, abaixo da medida no Chrome: 127 px e 82 px) dos textos em 540 px: "PRÉVIA • NÃO PAGO" a 12,5 px
// em negrito e "moldura-eleitoral" a 10 px.
export const WATERMARK_HALF_WIDTH = 56;
export const WATERMARK_SMALL_HALF_WIDTH = 40;

export function isSmallRow(row: number): boolean {
  return ((row % 3) + 3) % 3 === 1;
}

const SAMPLE_STEP = 2;

// Pontos ao longo da linha do texto do ladrilho.
function samples(tile: WatermarkTile): { x: number; y: number }[] {
  const cos = Math.cos(tile.angle);
  const sin = Math.sin(tile.angle);
  const points: { x: number; y: number }[] = [];

  for (let offset = -tile.halfWidth; offset <= tile.halfWidth; offset += SAMPLE_STEP) {
    points.push({ x: tile.x + offset * cos, y: tile.y + offset * sin });
  }

  return points;
}

// O texto do ladrilho passa dentro da janela quadrada (x, y, lado)?
export function tileTouchesWindow(tile: WatermarkTile, x: number, y: number, side: number): boolean {
  return samples(tile).some((point) => point.x >= x && point.x <= x + side && point.y >= y && point.y <= y + side);
}

// Ladrilhos de uma grade girada em torno do centro do canvas. Linhas alternadas são deslocadas
// meio passo; só ficam os que têm algum pedaço do texto dentro do canvas.
export function watermarkTiles(size: number, angle: number, stepX: number, stepY: number): WatermarkTile[] {
  const scale = size / WATERMARK_BASE_SIZE;
  const center = size / 2;
  const reach = size * 0.75 + stepX;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rows = Math.ceil(reach / stepY);
  const columns = Math.ceil(reach / stepX) + 1;
  const tiles: WatermarkTile[] = [];

  for (let row = -rows; row <= rows; row += 1) {
    const shift = row % 2 === 0 ? 0 : stepX / 2;
    const halfWidth = (isSmallRow(row) ? WATERMARK_SMALL_HALF_WIDTH : WATERMARK_HALF_WIDTH) * scale;

    for (let column = -columns; column <= columns; column += 1) {
      const localX = column * stepX + shift;
      const localY = row * stepY;
      const tile = { x: center + localX * cos - localY * sin, y: center + localX * sin + localY * cos, angle, row, halfWidth };

      if (tileTouchesWindow(tile, 0, 0, size)) {
        tiles.push(tile);
      }
    }
  }

  return tiles;
}

export function watermarkLayout(size: number): WatermarkTile[] {
  const scale = size / WATERMARK_BASE_SIZE;

  return WATERMARK_ANGLES.flatMap((angle) => watermarkTiles(size, angle, WATERMARK_STEP_X * scale, WATERMARK_STEP_Y * scale));
}

// Primeira janela (fração do lado) que nenhum texto de ladrilho atravessa, ou null se todas têm marca.
export function uncoveredWindow(size: number, tiles: readonly WatermarkTile[], fraction: number, stride: number): { x: number; y: number } | null {
  const side = size * fraction;
  const positions: number[] = [];

  for (let value = 0; value < size - side; value += stride) {
    positions.push(value);
  }

  positions.push(size - side);

  for (const y of positions) {
    for (const x of positions) {
      if (!tiles.some((tile) => tileTouchesWindow(tile, x, y, side))) {
        return { x, y };
      }
    }
  }

  return null;
}
