import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const userRoleEnum = pgEnum("user_role", ["internal", "external"]);

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  role: userRoleEnum("role").notNull().default("external"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  mandantAssignments: many(mandantUserAssignments),
}));

export const mandanten = pgTable("mandanten", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  mandantenNummer: integer("mandanten_nummer").notNull().unique(),
  beraterNummer: integer("berater_nummer").notNull(),
  sachkontenLaenge: integer("sachkonten_laenge").notNull(),
  sachkontenRahmen: integer("sachkonten_rahmen").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const mandantenRelations = relations(mandanten, ({ many }) => ({
  processes: many(processes),
  userAssignments: many(mandantUserAssignments),
  exports: many(exportRecords),
}));

export const mandantUserAssignments = pgTable("mandant_user_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mandantId: varchar("mandant_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mandantUserAssignmentsRelations = relations(mandantUserAssignments, ({ one }) => ({
  mandant: one(mandanten, {
    fields: [mandantUserAssignments.mandantId],
    references: [mandanten.id],
  }),
  userProfile: one(userProfiles, {
    fields: [mandantUserAssignments.userId],
    references: [userProfiles.userId],
  }),
}));

export const processStatusEnum = pgEnum("process_status", ["pending", "completed", "failed"]);
export const processTypeEnum = pgEnum("process_type", ["revenue", "payments"]);

export const processes = pgTable("processes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mandantId: varchar("mandant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  processType: processTypeEnum("process_type").notNull().default("payments"),
  inputFileCount: integer("input_file_count").notNull().default(1),
  inputFileSlots: jsonb("input_file_slots").notNull().default([]),
  transformationSteps: jsonb("transformation_steps").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const processesRelations = relations(processes, ({ one, many }) => ({
  mandant: one(mandanten, {
    fields: [processes.mandantId],
    references: [mandanten.id],
  }),
  executions: many(processExecutions),
}));

export const processExecutions = pgTable("process_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  processId: varchar("process_id").notNull(),
  mandantId: varchar("mandant_id").notNull(),
  status: processStatusEnum("status").notNull().default("pending"),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  inputFiles: jsonb("input_files").notNull().default([]),
  outputData: jsonb("output_data"),
  transactionCount: integer("transaction_count").default(0),
  totalAmount: text("total_amount"),
  countryBreakdown: jsonb("country_breakdown"),
  executedAt: timestamp("executed_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const processExecutionsRelations = relations(processExecutions, ({ one }) => ({
  process: one(processes, {
    fields: [processExecutions.processId],
    references: [processes.id],
  }),
  mandant: one(mandanten, {
    fields: [processExecutions.mandantId],
    references: [mandanten.id],
  }),
}));

export const exportFormatEnum = pgEnum("export_format", ["ascii", "datev"]);

export const exportRecords = pgTable("export_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mandantId: varchar("mandant_id").notNull(),
  processExecutionId: varchar("process_execution_id").notNull(),
  name: text("name").notNull(),
  format: exportFormatEnum("format").notNull(),
  exportedAt: timestamp("exported_at").defaultNow(),
  exportData: jsonb("export_data"),
});

export const exportRecordsRelations = relations(exportRecords, ({ one }) => ({
  mandant: one(mandanten, {
    fields: [exportRecords.mandantId],
    references: [mandanten.id],
  }),
  processExecution: one(processExecutions, {
    fields: [exportRecords.processExecutionId],
    references: [processExecutions.id],
  }),
}));

export const insertMandantSchema = createInsertSchema(mandanten).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProcessSchema = createInsertSchema(processes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProcessExecutionSchema = createInsertSchema(processExecutions).omit({
  id: true,
  executedAt: true,
  completedAt: true,
});

export const insertExportRecordSchema = createInsertSchema(exportRecords).omit({
  id: true,
  exportedAt: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
});

export const insertMandantUserAssignmentSchema = createInsertSchema(mandantUserAssignments).omit({
  id: true,
  createdAt: true,
});

export type InsertMandant = z.infer<typeof insertMandantSchema>;
export type Mandant = typeof mandanten.$inferSelect;

export type InsertProcess = z.infer<typeof insertProcessSchema>;
export type Process = typeof processes.$inferSelect;

export type InsertProcessExecution = z.infer<typeof insertProcessExecutionSchema>;
export type ProcessExecution = typeof processExecutions.$inferSelect;

export type InsertExportRecord = z.infer<typeof insertExportRecordSchema>;
export type ExportRecord = typeof exportRecords.$inferSelect;

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export type InsertMandantUserAssignment = z.infer<typeof insertMandantUserAssignmentSchema>;
export type MandantUserAssignment = typeof mandantUserAssignments.$inferSelect;

export interface TransformationStep {
  id: string;
  type: 'remove_column' | 'add_column' | 'rename_column' | 'merge_columns' | 'split_column' | 'remove_string' | 'match_files' | 'filter_rows';
  config: Record<string, unknown>;
}

export interface InputFileSlot {
  id: string;
  name: string;
  description?: string;
  required: boolean;
}

export interface FilePreview {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}
