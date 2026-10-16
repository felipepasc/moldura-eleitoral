import { CoreApiError } from "@felipepasc/core-sdk";
import type { CoreClient } from "@felipepasc/core-sdk";
import QRCode from "qrcode";
import type { CreatedPix, PixGateway, PixStatus } from "@/modules/payments/gateway";

const QR_WIDTH = 320;
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
// A cobrança no Core leva um cliente genérico: nenhum dado pessoal do comprador sai daqui.
const CUSTOMER_NAME = "Cliente Moldura Eleitoral";

export type CoreGatewayOptions = {
  client: Pick<CoreClient, "charges">;
  now?: () => Date;
};

// `AAAA-MM-DD` no horário de Brasília (o vencimento da cobrança é o dia da compra).
export function brasiliaDay(date: Date): string {
  return new Date(date.getTime() - BRASILIA_OFFSET_MS).toISOString().slice(0, 10);
}

// Só o status/código vão para o log: a mensagem do Core pode repetir dados da cobrança.
function describe(error: unknown, route: string): Error {
  if (error instanceof CoreApiError) {
    return new Error(error.status === 0 ? `Core não respondeu em ${route}` : `Core respondeu ${error.status} (${error.code}) em ${route}`);
  }

  return new Error(`Core falhou em ${route}`);
}

// Nunca infere PAID: só a cobrança `paid` libera. Estorno total volta a cobrança para `open` (pendente).
function mapStatus(raw: string): PixStatus {
  if (raw === "paid") {
    return "PAID";
  }

  if (raw === "canceled") {
    return "CANCELLED";
  }

  return "PENDING";
}

export function createCoreGateway(options: CoreGatewayOptions): PixGateway {
  const { charges } = options.client;
  const now = options.now ?? (() => new Date());

  return {
    async createPix(input): Promise<CreatedPix> {
      // A referência aleatória do pedido é o externalId da cobrança: repetir não duplica nada no Core.
      try {
        await charges.upsert(input.reference, {
          customer: { name: CUSTOMER_NAME },
          items: [{ description: input.description, unitPriceCents: input.amountCents }],
          dueDate: brasiliaDay(now()),
        });
      } catch (error) {
        throw describe(error, "/charges/:id");
      }

      let payment: Awaited<ReturnType<typeof charges.createPayment>>;

      try {
        payment = await charges.createPayment(input.reference, { method: "pix" });
      } catch (error) {
        throw describe(error, "/charges/:id/payments");
      }

      const brCode = payment.pixCopyPaste;
      const expiresAt = payment.expiresAt ? new Date(payment.expiresAt) : new Date(now().getTime() + input.expiresInSeconds * 1000);

      if (!brCode || payment.amountCents !== input.amountCents || Number.isNaN(expiresAt.getTime())) {
        throw new Error("Core respondeu formato inválido em /charges/:id/payments");
      }

      // QR gerado aqui, sem usar a imagem do provedor (nenhum pedido a terceiros no navegador).
      const dataUrl = await QRCode.toDataURL(brCode, { width: QR_WIDTH, margin: 1 });

      return {
        id: input.reference,
        brCode,
        brCodeBase64: dataUrl.replace(/^data:image\/png;base64,/, ""),
        expiresAt,
      };
    },

    async checkPix(id): Promise<PixStatus> {
      try {
        const charge = await charges.get(id);

        return mapStatus(charge.status);
      } catch (error) {
        throw describe(error, "/charges/:id");
      }
    },
  };
}
