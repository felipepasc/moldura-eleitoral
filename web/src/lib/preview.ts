import { FRAME_SIZE, innerRadius, placePhoto } from "@moldura/common";
import type { Framing } from "@moldura/common";

function drawWatermark(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = "800 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.fillStyle = "rgba(255,255,255,0.55)";

  for (let y = -size; y <= size; y += 220) {
    ctx.strokeText("PRÉVIA • MOLDURA ELEITORAL", 0, y);
    ctx.fillText("PRÉVIA • MOLDURA ELEITORAL", 0, y);
  }

  ctx.restore();
}

export function drawPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  frame: HTMLImageElement | null,
  framing: Framing,
): void {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const size = FRAME_SIZE;

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, innerRadius(size), 0, Math.PI * 2);
  ctx.clip();

  if (image) {
    const placement = placePhoto({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      zoom: framing.zoom,
      offsetX: framing.offsetX,
      offsetY: framing.offsetY,
      size,
    });

    ctx.drawImage(image, placement.left, placement.top, placement.width, placement.height);
  } else {
    // Sem foto: silhueta genérica (a mesma da home) até a pessoa escolher a foto.
    ctx.fillStyle = "#dfe6f1";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#a9b6c9";
    ctx.beginPath();
    ctx.arc(size / 2, size * 0.41, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.98, size * 0.33, size * 0.32, 0, Math.PI, 0);
    ctx.fill();
  }

  ctx.restore();

  if (frame) {
    ctx.drawImage(frame, 0, 0, size, size);
  }

  // A marca d'água é sempre a última camada; o canvas nunca é exportado.
  drawWatermark(ctx, size);
}
