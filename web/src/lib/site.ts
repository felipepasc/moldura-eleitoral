// Dados do operador (NEXT_PUBLIC_*, lidos no build). Sem os dois, as páginas legais omitem o bloco.
export type OperatorInfo = { name: string; email: string };

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function operatorInfo(name: string | undefined, email: string | undefined): OperatorInfo | null {
  const cleanName = name?.trim() ?? "";
  const cleanEmail = email?.trim() ?? "";

  if (!cleanName || !EMAIL.test(cleanEmail)) {
    return null;
  }

  return { name: cleanName, email: cleanEmail };
}

export const OPERATOR = operatorInfo(process.env.NEXT_PUBLIC_OPERATOR_NAME, process.env.NEXT_PUBLIC_CONTACT_EMAIL);

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
