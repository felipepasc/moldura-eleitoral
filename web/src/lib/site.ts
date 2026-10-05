// Dados do operador (NEXT_PUBLIC_*, lidos no build). Sem os dois, as páginas legais omitem o bloco.
export type OperatorInfo = { name: string; email: string; doc: string };

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function operatorInfo(name: string | undefined, email: string | undefined, doc?: string): OperatorInfo | null {
  const cleanName = name?.trim() ?? "";
  const cleanEmail = email?.trim() ?? "";

  if (!cleanName || !EMAIL.test(cleanEmail)) {
    return null;
  }

  return { name: cleanName, email: cleanEmail, doc: doc?.trim() ?? "" };
}

// Identificação legal em uma linha (rodapé): nome · documento (se houver) · e-mail.
export function operatorLine(info: OperatorInfo | null): string {
  if (!info) {
    return "";
  }

  return [info.name, info.doc, info.email].filter((part) => part !== "").join(" · ");
}

export const OPERATOR = operatorInfo(process.env.NEXT_PUBLIC_OPERATOR_NAME, process.env.NEXT_PUBLIC_CONTACT_EMAIL, process.env.NEXT_PUBLIC_OPERATOR_DOC);

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
