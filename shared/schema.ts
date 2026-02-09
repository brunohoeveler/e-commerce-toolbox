import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import { user } from "./schema/auth";
export * from "./schema/auth";

export const userRoleEnum = pgEnum("user_role", ["internal", "external", "admin"]);

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").notNull().default("external"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  mandantAssignments: many(mandantUserAssignments),
}));

export interface DashboardConfig {
  viewMode: "monthly" | "yearly";
  showTotalRevenue: boolean;
  showRevenueByPlatform: boolean;
  showRevenueByCountry: boolean;
  showRevenueByCurrency: boolean;
  showProcessExecutions: boolean;
  showProcessTodos: boolean;
}

export const defaultDashboardConfig: DashboardConfig = {
  viewMode: "monthly",
  showTotalRevenue: true,
  showRevenueByPlatform: true,
  showRevenueByCountry: true,
  showRevenueByCurrency: true,
  showProcessExecutions: true,
  showProcessTodos: true,
};

export const mandanten = pgTable("mandanten", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  mandantenNummer: integer("mandanten_nummer").notNull().unique(),
  beraterNummer: integer("berater_nummer").notNull(),
  sachkontenLaenge: integer("sachkonten_laenge").notNull(),
  sachkontenRahmen: integer("sachkonten_rahmen").notNull(),
  dashboardConfig: jsonb("dashboard_config").$type<DashboardConfig>().default(defaultDashboardConfig),
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
export const executionFrequencyEnum = pgEnum("execution_frequency", ["weekly", "monthly", "quarterly", "yearly"]);

export const macros = pgTable("macros", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  pythonCode: text("python_code").notNull(),
  patternFiles: jsonb("pattern_files").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export interface PatternFile {
  id: string;
  name: string;
  variable: string;
  storagePath: string;
  originalFilename: string;
}

export const templateFiles = pgTable("template_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const processes = pgTable("processes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mandantId: varchar("mandant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  executionFrequency: executionFrequencyEnum("execution_frequency").notNull().default("monthly"),
  inputFileCount: integer("input_file_count").notNull().default(1),
  inputFileSlots: jsonb("input_file_slots").notNull().default([]),
  pythonCode: text("python_code").notNull().default(""),
  outputFiles: jsonb("output_files").notNull().default([]),
  usedMacroIds: jsonb("used_macro_ids").notNull().default([]),
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
  month: integer("month"),
  quarter: integer("quarter"),
  year: integer("year").notNull(),
  inputFiles: jsonb("input_files").notNull().default([]),
  attachments: jsonb("attachments").notNull().default([]),
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

export const insertMacroSchema = createInsertSchema(macros).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export type InsertMacro = z.infer<typeof insertMacroSchema>;
export type Macro = typeof macros.$inferSelect;

export const insertTemplateFileSchema = createInsertSchema(templateFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTemplateFile = z.infer<typeof insertTemplateFileSchema>;
export type TemplateFile = typeof templateFiles.$inferSelect;

export interface InputFileSlot {
  id: string;
  variable: string;
  label: string;
  description?: string;
  required: boolean;
}

export interface OutputFile {
  id: string;
  name: string;
  dataFrameVariable: string;
  format: 'csv' | 'xlsx' | 'json';
  delimiter?: ',' | ';' | '\t';
}

export interface FilePreview {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}
