import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as orderSchema from "@/modules/orders/schema";
import * as paymentSchema from "@/modules/payments/schema";

const schema = { ...orderSchema, ...paymentSchema };

export function createDb(url: string) {
  const sql = postgres(url);
  const db = drizzle(sql, { schema });

  return { db, sql };
}

export type Database = ReturnType<typeof createDb>["db"];
