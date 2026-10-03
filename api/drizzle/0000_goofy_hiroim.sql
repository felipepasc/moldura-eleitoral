CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'paid_failed', 'expired');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"candidate_id" text NOT NULL,
	"photo_key" text,
	"framing" jsonb NOT NULL,
	"pix_id" text NOT NULL,
	"pix_br_code" text NOT NULL,
	"pix_br_code_base64" text NOT NULL,
	"result_key" text,
	"ip_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_pix_id_unique" UNIQUE("pix_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
