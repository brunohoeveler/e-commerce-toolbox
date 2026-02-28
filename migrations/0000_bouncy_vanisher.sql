CREATE TYPE "public"."execution_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('ascii', 'datev');--> statement-breakpoint
CREATE TYPE "public"."input_mode" AS ENUM('daten', 'beleg');--> statement-breakpoint
CREATE TYPE "public"."process_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."process_type" AS ENUM('umsatz', 'zahlung', 'gutschein');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('internal', 'external', 'admin');--> statement-breakpoint
CREATE TABLE "export_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" varchar NOT NULL,
	"process_execution_id" varchar NOT NULL,
	"name" text NOT NULL,
	"format" "export_format" NOT NULL,
	"exported_at" timestamp DEFAULT now(),
	"export_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "macros" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"python_code" text NOT NULL,
	"pattern_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "macros_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "mandant_user_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mandanten" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"mandanten_nummer" integer NOT NULL,
	"berater_nummer" integer NOT NULL,
	"sachkonten_laenge" integer NOT NULL,
	"sachkonten_rahmen" integer NOT NULL,
	"dashboard_config" jsonb DEFAULT '{"showTotalRevenue":true,"showRevenueByPlatform":true,"showRevenueByCountry":true,"showRevenueByCurrency":true,"showProcessExecutions":true,"showProcessTodos":true,"showTransactions":true,"showRevenue":true,"showPayments":true,"showOpenPayments":true,"showVouchers":true}'::jsonb,
	"oss_beteiligung" boolean DEFAULT false,
	"api_connections" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "mandanten_mandanten_nummer_unique" UNIQUE("mandanten_nummer")
);
--> statement-breakpoint
CREATE TABLE "process_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_id" varchar NOT NULL,
	"mandant_id" varchar NOT NULL,
	"status" "process_status" DEFAULT 'pending' NOT NULL,
	"month" integer,
	"quarter" integer,
	"year" integer NOT NULL,
	"input_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_data" jsonb,
	"manual_amounts" jsonb,
	"transaction_count" integer DEFAULT 0,
	"total_amount" text,
	"country_breakdown" jsonb,
	"currency_breakdown" jsonb,
	"platform_breakdown" jsonb,
	"executed_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "processes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"process_type" "process_type" DEFAULT 'umsatz' NOT NULL,
	"input_mode" "input_mode" DEFAULT 'daten' NOT NULL,
	"execution_frequency" "execution_frequency" DEFAULT 'monthly' NOT NULL,
	"input_file_count" integer DEFAULT 1 NOT NULL,
	"input_file_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"python_code" text DEFAULT '' NOT NULL,
	"output_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"used_macro_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"beleg_file_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual_amount_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"country_column" text,
	"platform_name" text,
	"api_connection_id" text,
	"api_data_config" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "template_files_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "user_role" DEFAULT 'external' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token");