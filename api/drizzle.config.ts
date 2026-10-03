import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/modules/orders/schema.ts", "./src/modules/payments/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
