// Atalhos de captura de tela do sistema (só para escurecer a prévia por um instante; é atrito,
// não proteção: celular, gravador de tela e câmera não passam por aqui).
export type ShortcutEvent = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey?: boolean };

const META_SHIFT_KEYS = new Set(["s", "3", "4", "5", "#", "$", "%"]);

export function isCaptureShortcut(event: ShortcutEvent): boolean {
  if (event.key === "PrintScreen") {
    return true;
  }

  return event.metaKey && event.shiftKey && !event.ctrlKey && META_SHIFT_KEYS.has(event.key.toLowerCase());
}

export const BLACKOUT_MS = 1500;
