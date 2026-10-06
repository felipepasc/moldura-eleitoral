export type PixStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";

export type CreatePixInput = {
  amountCents: number;
  description: string;
  expiresInSeconds: number;
  // Id do pedido: o gateway pode usá-lo como identificador próprio da cobrança (Woovi) ou ignorá-lo (AbacatePay).
  reference: string;
};

export type CreatedPix = {
  id: string;
  brCode: string;
  brCodeBase64: string;
  expiresAt: Date;
};

export interface PixGateway {
  createPix(input: CreatePixInput): Promise<CreatedPix>;
  checkPix(id: string): Promise<PixStatus>;
}
