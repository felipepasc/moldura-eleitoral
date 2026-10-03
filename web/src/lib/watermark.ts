// Geometria da marca d'água da prévia: ladrilhos de texto em duas grades giradas (−30° e +30°)
// que se cruzam. Os testes garantem que nenhum recorte de 15% × 15% da prévia escapa dela.

export type WatermarkTile = { x: number; y: number; angle: number; row: number };

export const WATERMARK_BASE_SIZE = 540;
export const WATERMARK_ANGLES: readonly number[] = [-Math.PI / 6, Math.PI / 6];
// Espaçamentos para a prévia de 540 px; em outros tamanhos escalam junto.
export const WATERMARK_STEP_X = 140;
export const WATERMARK_STEP_Y = 40;

// Centros dos ladrilhos de uma grade girada em torno do centro do canvas. Linhas alternadas são
// deslocadas meio passo, para os textos não ficarem alinhados em colunas.
export function watermarkTiles(size: number, angle: number, stepX: number, stepY: number): WatermarkTile[] {
  const center = size / 2;
  const reach = size * 0.75 + stepX;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rows = Math.ceil(reach / stepY);
  const columns = Math.ceil(reach / stepX) + 1;
  const tiles: WatermarkTile[] = [];

  for (let row = -rows; row <= rows; row += 1) {
    const shift = row % 2 === 0 ? 0 : stepX / 2;

    for (let column = -columns; column <= columns; column += 1) {
      const localX = column * stepX + shift;
      const localY = row * stepY;
      const x = center + localX * cos - localY * sin;
      const y = center + localX * sin + localY * cos;

      if (x > -stepX && x < size + stepX && y > -stepY && y < size + stepY) {
        tiles.push({ x, y, angle, row });
      }
    }
  }

  return tiles;
}

export function watermarkLayout(size: number): WatermarkTile[] {
  const scale = size / WATERMARK_BASE_SIZE;

  return WATERMARK_ANGLES.flatMap((angle) => watermarkTiles(size, angle, WATERMARK_STEP_X * scale, WATERMARK_STEP_Y * scale));
}

// Primeira janela (fração do lado) sem nenhum centro de ladrilho, ou null se todas têm.
export function uncoveredWindow(size: number, tiles: readonly WatermarkTile[], fraction: number, stride: number): { x: number; y: number } | null {
  const side = size * fraction;
  const positions: number[] = [];

  for (let value = 0; value < size - side; value += stride) {
    positions.push(value);
  }

  positions.push(size - side);

  for (const y of positions) {
    for (const x of positions) {
      const covered = tiles.some((tile) => tile.x >= x && tile.x <= x + side && tile.y >= y && tile.y <= y + side);

      if (!covered) {
        return { x, y };
      }
    }
  }

  return null;
}
