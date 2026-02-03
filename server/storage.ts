import { 
  mandanten, type Mandant, type InsertMandant,
  processes, type Process, type InsertProcess,
  processExecutions, type ProcessExecution, type InsertProcessExecution,
  exportRecords, type ExportRecord, type InsertExportRecord,
  userProfiles, type UserProfile, type InsertUserProfile,
  mandantUserAssignments, type MandantUserAssignment, type InsertMandantUserAssignment,
  users, type User,
  macros, type Macro, type InsertMacro
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getMandanten(): Promise<Mandant[]>;
  getMandant(id: string): Promise<Mandant | undefined>;
  getMandantenForUser(userId: string, isInternal: boolean): Promise<Mandant[]>;
  createMandant(mandant: InsertMandant): Promise<Mandant>;
  updateMandant(id: string, mandant: Partial<InsertMandant>): Promise<Mandant | undefined>;
  deleteMandant(id: string): Promise<void>;

  getProcesses(mandantId: string): Promise<Process[]>;
  getProcess(id: string): Promise<Process | undefined>;
  createProcess(process: InsertProcess): Promise<Process>;
  updateProcess(id: string, process: Partial<InsertProcess>): Promise<Process | undefined>;
  deleteProcess(id: string): Promise<void>;

  getProcessExecutions(mandantId: string, month?: number, year?: number): Promise<ProcessExecution[]>;
  getCompletedProcessExecutions(mandantId: string): Promise<ProcessExecution[]>;
  getRecentProcessExecutions(mandantId: string): Promise<ProcessExecution[]>;
  getProcessExecution(id: string): Promise<ProcessExecution | undefined>;
  createProcessExecution(execution: InsertProcessExecution): Promise<ProcessExecution>;
  updateProcessExecution(id: string, execution: Partial<InsertProcessExecution> & { completedAt?: Date }): Promise<ProcessExecution | undefined>;

  getExportRecords(mandantId: string): Promise<ExportRecord[]>;
  createExportRecord(record: InsertExportRecord): Promise<ExportRecord>;

  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  getUsers(): Promise<(User & { profile?: UserProfile })[]>;

  getMandantUserAssignments(mandantId: string): Promise<(MandantUserAssignment & { user: User })[]>;
  createMandantUserAssignment(assignment: InsertMandantUserAssignment): Promise<MandantUserAssignment>;
  deleteMandantUserAssignment(mandantId: string, userId: string): Promise<void>;
  getUserAssignedMandanten(userId: string): Promise<Mandant[]>;
  getUserMandantAssignments(userId: string): Promise<MandantUserAssignment[]>;
  getExportRecord(id: string): Promise<ExportRecord | undefined>;
  getProcessExecutionById(id: string): Promise<ProcessExecution | undefined>;
  deleteProcessExecution(id: string): Promise<void>;

  getMacros(): Promise<Macro[]>;
  getMacro(id: string): Promise<Macro | undefined>;
  getMacroByName(name: string): Promise<Macro | undefined>;
  createMacro(macro: InsertMacro): Promise<Macro>;
  updateMacro(id: string, macro: Partial<InsertMacro>): Promise<Macro | undefined>;
  deleteMacro(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getMandanten(): Promise<Mandant[]> {
    return db.select().from(mandanten).orderBy(desc(mandanten.createdAt));
  }

  async getMandant(id: string): Promise<Mandant | undefined> {
    const [mandant] = await db.select().from(mandanten).where(eq(mandanten.id, id));
    return mandant;
  }

  async getMandantenForUser(userId: string, isInternal: boolean): Promise<Mandant[]> {
    if (isInternal) {
      return this.getMandanten();
    }
    return this.getUserAssignedMandanten(userId);
  }

  async createMandant(mandant: InsertMandant): Promise<Mandant> {
    const [created] = await db.insert(mandanten).values(mandant).returning();
    return created;
  }

  async updateMandant(id: string, mandant: Partial<InsertMandant>): Promise<Mandant | undefined> {
    const [updated] = await db
      .update(mandanten)
      .set({ ...mandant, updatedAt: new Date() })
      .where(eq(mandanten.id, id))
      .returning();
    return updated;
  }

  async deleteMandant(id: string): Promise<void> {
    await db.delete(mandanten).where(eq(mandanten.id, id));
  }

  async getProcesses(mandantId: string): Promise<Process[]> {
    return db.select().from(processes).where(eq(processes.mandantId, mandantId)).orderBy(desc(processes.createdAt));
  }

  async getProcess(id: string): Promise<Process | undefined> {
    const [process] = await db.select().from(processes).where(eq(processes.id, id));
    return process;
  }

  async createProcess(process: InsertProcess): Promise<Process> {
    const [created] = await db.insert(processes).values(process).returning();
    return created;
  }

  async updateProcess(id: string, process: Partial<InsertProcess>): Promise<Process | undefined> {
    const [updated] = await db
      .update(processes)
      .set({ ...process, updatedAt: new Date() })
      .where(eq(processes.id, id))
      .returning();
    return updated;
  }

  async deleteProcess(id: string): Promise<void> {
    await db.delete(processes).where(eq(processes.id, id));
  }

  async getProcessExecutions(mandantId: string, month?: number, year?: number): Promise<ProcessExecution[]> {
    let query = db.select().from(processExecutions).where(eq(processExecutions.mandantId, mandantId));
    
    if (month && year) {
      query = db.select().from(processExecutions).where(
        and(
          eq(processExecutions.mandantId, mandantId),
          eq(processExecutions.month, month),
          eq(processExecutions.year, year)
        )
      );
    }
    
    return query.orderBy(desc(processExecutions.executedAt));
  }

  async getCompletedProcessExecutions(mandantId: string): Promise<ProcessExecution[]> {
    return db
      .select()
      .from(processExecutions)
      .where(and(
        eq(processExecutions.mandantId, mandantId),
        eq(processExecutions.status, "completed")
      ))
      .orderBy(desc(processExecutions.executedAt));
  }

  async getRecentProcessExecutions(mandantId: string): Promise<ProcessExecution[]> {
    return db
      .select()
      .from(processExecutions)
      .where(eq(processExecutions.mandantId, mandantId))
      .orderBy(desc(processExecutions.executedAt))
      .limit(20);
  }

  async getProcessExecution(id: string): Promise<ProcessExecution | undefined> {
    const [execution] = await db.select().from(processExecutions).where(eq(processExecutions.id, id));
    return execution;
  }

  async createProcessExecution(execution: InsertProcessExecution): Promise<ProcessExecution> {
    const [created] = await db.insert(processExecutions).values(execution).returning();
    return created;
  }

  async updateProcessExecution(id: string, execution: Partial<InsertProcessExecution> & { completedAt?: Date }): Promise<ProcessExecution | undefined> {
    const [updated] = await db
      .update(processExecutions)
      .set(execution)
      .where(eq(processExecutions.id, id))
      .returning();
    return updated;
  }

  async getExportRecords(mandantId: string): Promise<ExportRecord[]> {
    return db
      .select()
      .from(exportRecords)
      .where(eq(exportRecords.mandantId, mandantId))
      .orderBy(desc(exportRecords.exportedAt));
  }

  async createExportRecord(record: InsertExportRecord): Promise<ExportRecord> {
    const [created] = await db.insert(exportRecords).values(record).returning();
    return created;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [created] = await db.insert(userProfiles).values(profile).returning();
    return created;
  }

  async updateUserProfile(userId: string, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [updated] = await db
      .update(userProfiles)
      .set(profile)
      .where(eq(userProfiles.userId, userId))
      .returning();
    return updated;
  }

  async getUsers(): Promise<(User & { profile?: UserProfile })[]> {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    const allProfiles = await db.select().from(userProfiles);
    
    return allUsers.map(user => ({
      ...user,
      profile: allProfiles.find(p => p.userId === user.id)
    }));
  }

  async getMandantUserAssignments(mandantId: string): Promise<(MandantUserAssignment & { user: User })[]> {
    const assignments = await db
      .select()
      .from(mandantUserAssignments)
      .where(eq(mandantUserAssignments.mandantId, mandantId));
    
    const result: (MandantUserAssignment & { user: User })[] = [];
    
    for (const assignment of assignments) {
      const [user] = await db.select().from(users).where(eq(users.id, assignment.userId));
      if (user) {
        result.push({ ...assignment, user });
      }
    }
    
    return result;
  }

  async createMandantUserAssignment(assignment: InsertMandantUserAssignment): Promise<MandantUserAssignment> {
    const [created] = await db.insert(mandantUserAssignments).values(assignment).returning();
    return created;
  }

  async deleteMandantUserAssignment(mandantId: string, userId: string): Promise<void> {
    await db
      .delete(mandantUserAssignments)
      .where(and(
        eq(mandantUserAssignments.mandantId, mandantId),
        eq(mandantUserAssignments.userId, userId)
      ));
  }

  async getUserAssignedMandanten(userId: string): Promise<Mandant[]> {
    const assignments = await db
      .select()
      .from(mandantUserAssignments)
      .where(eq(mandantUserAssignments.userId, userId));
    
    const result: Mandant[] = [];
    
    for (const assignment of assignments) {
      const mandant = await this.getMandant(assignment.mandantId);
      if (mandant) {
        result.push(mandant);
      }
    }
    
    return result;
  }

  async getUserMandantAssignments(userId: string): Promise<MandantUserAssignment[]> {
    return db
      .select()
      .from(mandantUserAssignments)
      .where(eq(mandantUserAssignments.userId, userId));
  }

  async getExportRecord(id: string): Promise<ExportRecord | undefined> {
    const [record] = await db.select().from(exportRecords).where(eq(exportRecords.id, id));
    return record;
  }

  async getProcessExecutionById(id: string): Promise<ProcessExecution | undefined> {
    const [execution] = await db.select().from(processExecutions).where(eq(processExecutions.id, id));
    return execution;
  }

  async deleteProcessExecution(id: string): Promise<void> {
    await db.delete(exportRecords).where(eq(exportRecords.processExecutionId, id));
    await db.delete(processExecutions).where(eq(processExecutions.id, id));
  }

  async getMacros(): Promise<Macro[]> {
    return db.select().from(macros).orderBy(desc(macros.createdAt));
  }

  async getMacro(id: string): Promise<Macro | undefined> {
    const [macro] = await db.select().from(macros).where(eq(macros.id, id));
    return macro;
  }

  async getMacroByName(name: string): Promise<Macro | undefined> {
    const [macro] = await db.select().from(macros).where(eq(macros.name, name));
    return macro;
  }

  async createMacro(macro: InsertMacro): Promise<Macro> {
    const [created] = await db.insert(macros).values(macro).returning();
    return created;
  }

  async updateMacro(id: string, macro: Partial<InsertMacro>): Promise<Macro | undefined> {
    const [updated] = await db
      .update(macros)
      .set({ ...macro, updatedAt: new Date() })
      .where(eq(macros.id, id))
      .returning();
    return updated;
  }

  async deleteMacro(id: string): Promise<void> {
    await db.delete(macros).where(eq(macros.id, id));
  }
}

export const storage = new DatabaseStorage();
