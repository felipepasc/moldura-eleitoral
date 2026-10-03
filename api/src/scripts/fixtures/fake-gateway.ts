import { randomUUID } from "node:crypto";
import type { CreatePixInput, PixGateway, PixStatus } from "@/modules/payments/gateway";

export type FakeGateway = PixGateway & {
  statuses: Map<string, PixStatus>;
  inputs: CreatePixInput[];
  created: string[];
  failCreate: boolean;
  failCheck: boolean;
  nextId: string | null;
};

export function createFakeGateway(): FakeGateway {
  const gateway: FakeGateway = {
    statuses: new Map(),
    inputs: [],
    created: [],
    failCreate: false,
    failCheck: false,
    nextId: null,

    async createPix(input) {
      if (gateway.failCreate) {
        throw new Error("gateway fora do ar");
      }

      const id = gateway.nextId ?? `pix_${randomUUID().slice(0, 8)}`;
      gateway.statuses.set(id, "PENDING");
      gateway.inputs.push(input);
      gateway.created.push(id);

      return {
        id,
        brCode: `000201-${id}`,
        brCodeBase64: "QUJD",
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      };
    },

    async checkPix(id) {
      if (gateway.failCheck) {
        throw new Error("gateway fora do ar");
      }

      return gateway.statuses.get(id) ?? "PENDING";
    },
  };

  return gateway;
}
