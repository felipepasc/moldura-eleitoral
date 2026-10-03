import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
