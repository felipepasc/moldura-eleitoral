import { AiBadge } from "@/components/AiBadge";
import { artSrc, displayName, frameSrc } from "@/lib/art";

type FramedPortraitProps = { id: string; name: string; badge?: "sm" | "md" | "lg" | "none"; decorative?: boolean; eager?: boolean; frameAlt?: string };

// Ilustração (ou silhueta genérica) recortada em círculo, com a moldura do candidato por cima.
// O selo de IA aparece sempre que a imagem mostrada é uma ilustração gerada por IA.
export function FramedPortrait({ id, name, badge = "md", decorative = false, eager = false, frameAlt }: FramedPortraitProps) {
  const art = artSrc(id);
  const readable = displayName(name);

  return (
    <div className="portrait">
      <div className="portrait-photo">
        {art ? (
          <img src={art} alt={decorative ? "" : `Ilustração estilizada, gerada por IA, de ${readable}`} loading={eager ? "eager" : "lazy"} decoding="async" width={640} height={640} />
        ) : (
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <rect width="100" height="100" fill="#dfe6f1" />
            <circle cx="50" cy="41" r="17" fill="#a9b6c9" />
            <path d="M14 100c2-22 17-34 36-34s34 12 36 34z" fill="#a9b6c9" />
          </svg>
        )}
      </div>
      <img className="portrait-frame" src={frameSrc(id)} alt={decorative ? "" : (frameAlt ?? `Moldura de ${readable}`)} loading={eager ? "eager" : "lazy"} decoding="async" width={1080} height={1080} />
      {art && badge !== "none" ? <AiBadge size={badge} /> : null}
    </div>
  );
}
