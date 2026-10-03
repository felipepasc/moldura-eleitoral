import type { Database } from "@/core/db";
import type { Logger } from "@/core/logger";
import type { Storage } from "@/core/storage";
import type { PixGateway } from "@/modules/payments/gateway";

export type OrderContext = {
  db: Database;
  storage: Storage;
  gateway: PixGateway;
  framesDir: string;
  logger: Logger;
  now: () => Date;
};
