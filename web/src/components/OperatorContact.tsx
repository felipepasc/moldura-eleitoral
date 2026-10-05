import { OPERATOR } from "@/lib/site";

// Bloco de operador e contato; só aparece quando NEXT_PUBLIC_OPERATOR_NAME e NEXT_PUBLIC_CONTACT_EMAIL estão definidos.
export function OperatorContact() {
  if (!OPERATOR) {
    return null;
  }

  return (
    <section className="legal-contact" aria-labelledby="contato">
      <h2 id="contato">Quem opera o site e como falar com a gente</h2>
      <p>
        Operador: <strong>{OPERATOR.name}</strong>
        {OPERATOR.doc ? <> · {OPERATOR.doc}</> : null}
      </p>
      <p>
        Contato: <strong>{OPERATOR.email}</strong>{" "}
        <a href={`mailto:${OPERATOR.email}`}>(enviar e-mail)</a>
      </p>
    </section>
  );
}

export function contactText(): string {
  return OPERATOR ? `pelo e-mail ${OPERATOR.email}` : "pelo contato do operador do site";
}
