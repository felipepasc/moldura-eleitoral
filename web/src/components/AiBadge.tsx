// Selo de "gerada por IA": só para as ilustrações do site, nunca sobre a foto do usuário.
export function AiBadge({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`ai-badge ai-badge--${size}`} role="img" aria-label="Ilustração gerada por IA" title="Ilustração gerada por IA">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9z" fill="currentColor" />
        <path d="M19 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" />
      </svg>
      <span aria-hidden="true">IA</span>
    </span>
  );
}
