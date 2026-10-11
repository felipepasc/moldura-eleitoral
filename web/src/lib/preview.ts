import { CENTER_HOLE, innerRadius, placePhoto } from "@moldura/common";
import type { FrameHole, Framing } from "@moldura/common";
import { PREVIEW_SIZE } from "@/lib/preview-geometry";
import { WATERMARK_BASE_SIZE, isSmallRow, watermarkLayout } from "@/lib/watermark";

const WATERMARK_TEXT = "PRÉVIA • NÃO PAGO";
const WATERMARK_SMALL_TEXT = "moldura-eleitoral";

// Marca d'água densa em duas grades cruzadas, por cima de foto E moldura (sem recorte limpo).
function drawWatermark(ctx: CanvasRenderingContext2D, size: number): void {
  const scale = size / WATERMARK_BASE_SIZE;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  for (const tile of watermarkLayout(size)) {
    const small = isSmallRow(tile.row);

    ctx.save();
    ctx.translate(tile.x, tile.y);
    ctx.rotate(tile.angle);
    ctx.font = small ? `700 ${10 * scale}px system-ui, sans-serif` : `800 ${12.5 * scale}px system-ui, sans-serif`;
    ctx.lineWidth = 2.4 * scale;
    ctx.strokeStyle = "rgba(15,23,42,0.32)";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.strokeText(small ? WATERMARK_SMALL_TEXT : WATERMARK_TEXT, 0, 0);
    ctx.fillText(small ? WATERMARK_SMALL_TEXT : WATERMARK_TEXT, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawBlackout(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${size * 0.045}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Pré-visualização oculta", size / 2, size / 2);
}

// Molduras de candidato têm furo de formato livre: a foto é recortada pela máscara e posicionada pelo furo.
export type PreviewLayout = { mask: HTMLImageElement; hole: FrameHole };

// Desenha a prévia no canvas (buffer de PREVIEW_SIZE px). O canvas nunca é exportado
// (nenhuma API de exportação de canvas é usada): a foto final limpa só é montada no servidor depois do Pix.
export function drawPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  frame: HTMLImageElement | null,
  framing: Framing,
  hidden = false,
  layout: PreviewLayout | null = null,
): void {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const size = PREVIEW_SIZE;

  ctx.clearRect(0, 0, size, size);

  if (hidden) {
    drawBlackout(ctx, size);

    return;
  }

  const hole = layout?.hole ?? CENTER_HOLE;

  ctx.save();

  // Sem máscara (moldura neutra), a foto fica no círculo central.
  if (!layout) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, innerRadius(size), 0, Math.PI * 2);
    ctx.clip();
  }

  // Mesmo fundo do servidor para onde a foto não alcança.
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, size, size);

  if (image) {
    const placement = placePhoto({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      zoom: framing.zoom,
      offsetX: framing.offsetX,
      offsetY: framing.offsetY,
      size,
      hole,
    });

    ctx.drawImage(image, placement.left, placement.top, placement.width, placement.height);
  } else {
    // Sem foto: silhueta genérica (a mesma da home) até a pessoa escolher a foto.
    ctx.fillStyle = "#dfe6f1";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#a9b6c9";

    // A silhueta acompanha o furo (mesmas proporções da moldura neutra).
    const unit = (hole.r / CENTER_HOLE.r) * size;
    const centerX = hole.cx * size;
    const centerY = hole.cy * size;

    ctx.beginPath();
    ctx.arc(centerX, centerY - unit * 0.09, unit * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + unit * 0.48, unit * 0.33, unit * 0.32, 0, Math.PI, 0);
    ctx.fill();
  }

  if (layout) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(layout.mask, 0, 0, size, size);
  }

  ctx.restore();

  if (frame) {
    ctx.drawImage(frame, 0, 0, size, size);
  }

  // A marca d'água é sempre a última camada.
  drawWatermark(ctx, size);
}
