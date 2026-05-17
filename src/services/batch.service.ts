// ---------------------------------------------------------------------------
// EduOS — Batch Service
// Full CRUD for the `batches` table + student assignment operations.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { cachedQuery, invalidateQueryCache } from "@/lib/query-cache";
import { runService } from "@/lib/service-runner";
import { getErrorMessage } from "@/utils/helpers";
import type { Batch, Student, CreateBatchPayload, UpdateBatchPayload, ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

/**
 * Columns on `public.batches` (migrations 003 + 006).
 * `description` is omitted until migration 022 is applied — including it breaks
 * PostgREST when the column is missing from the live schema.
 */
export const BATCH_SELECT_COLUMNS =
  "id, institute_id, name, academic_year, batch_code, course_name, start_date, end_date, capacity, is_active, status, archived_at, created_at, updated_at";

const BATCH_CACHE_PREFIX = "batches:";

const BATCH_DEBUG = import.meta.env.DEV;

function debugBatch(label: string, payload: unknown) {
  if (BATCH_DEBUG) {
    console.debug(`[batch.service] ${label}`, payload);
  }
}

export function invalidateBatchesCache(instituteId?: string) {
  invalidateQueryCache(instituteId ? `${BATCH_CACHE_PREFIX}${instituteId}` : BATCH_CACHE_PREFIX);
}

function deriveAcademicYear(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    const y = new Date().getFullYear();
    return `${y}-${String(y + 1).slice(-2)}`;
  }
  const startYear = start.getFullYear();
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function deriveBatchCode(name: string, explicit?: string): string {
  const trimmed = explicit?.trim().toUpperCase();
  if (trimmed) return trimmed.slice(0, 50);
  const slug = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (slug.slice(0, 8) || "BATCH").padEnd(4, "0");
}

/** Map form/API payload to DB insert row (required NOT NULL columns from migration 006). */
function normalizeBatchInsert(payload: CreateBatchPayload): Record<string, unknown> {
  const name = payload.name.trim();
  const startDate = payload.start_date?.trim() || new Date().toISOString().slice(0, 10);
  const endDate = payload.end_date?.trim() || startDate;
  const academicYear = payload.academic_year?.trim() || deriveAcademicYear(startDate);

  const row: Record<string, unknown> = {
    institute_id: payload.institute_id,
    name,
    academic_year: academicYear,
    batch_code: deriveBatchCode(name, payload.batch_code),
    course_name: (payload.course_name?.trim() || name).slice(0, 100),
    start_date: startDate,
    end_date: endDate,
    capacity: payload.capacity ?? 50,
    status: "active",
    is_active: true,
  };

  return row;
}

function normalizeBatchUpdate(payload: UpdateBatchPayload): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if (payload.name !== undefined) row.name = payload.name.trim();
  if (payload.academic_year !== undefined) row.academic_year = payload.academic_year.trim();
  if (payload.batch_code !== undefined) {
    row.batch_code = payload.batch_code.trim().toUpperCase() || undefined;
  }
  if (payload.course_name !== undefined) row.course_name = payload.course_name.trim();
  if (payload.start_date !== undefined) row.start_date = payload.start_date;
  if (payload.end_date !== undefined) row.end_date = payload.end_date;
  if (payload.capacity !== undefined) row.capacity = payload.capacity;
  if (payload.is_active !== undefined) {
    row.is_active = payload.is_active;
    row.status = payload.is_active ? "active" : "inactive";
  }

  return row;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Return all batches for an institute, with student count. */
export async function getBatchesWithStudentCount(
  instituteId: string,
): Promise<ApiResponse<(Batch & { student_count: number })[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .select(BATCH_SELECT_COLUMNS)
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  debugBatch("getBatchesWithStudentCount", { instituteId, error, count: data?.length });

  if (error) return { data: null, error: error.message, success: false };

  const { data: counts, error: countError } = await supabase
    .from("students")
    .select("batch_id")
    .eq("institute_id", instituteId)
    .not("batch_id", "is", null);

  if (countError) return { data: null, error: countError.message, success: false };

  const studentCounts = new Map<string, number>();
  for (const row of counts ?? []) {
    studentCounts.set(row.batch_id, (studentCounts.get(row.batch_id) ?? 0) + 1);
  }

  const items = (data ?? []).map((row) => ({
    ...row,
    student_count: studentCounts.get(row.id) ?? 0,
  })) as (Batch & { student_count: number })[];

  return { data: items, error: null, success: true };
}

/** Return active batches only (used by attendance page dropdown). */
export async function getBatchesByInstitute(
  instituteId: string,
  includeInactive = false,
): Promise<ApiResponse<Batch[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const cacheKey = `${BATCH_CACHE_PREFIX}${instituteId}:${includeInactive ? "all" : "active"}`;

  return runService("getBatchesByInstitute", async () => {
    const data = await cachedQuery(cacheKey, 30_000, async () => {
      let query = supabase
        .from("batches")
        .select(BATCH_SELECT_COLUMNS)
        .eq("institute_id", instituteId)
        .order("created_at", { ascending: false });

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data: rows, error } = await query;
      if (error) throw new Error(getErrorMessage(error));
      debugBatch("getBatchesByInstitute", {
        instituteId,
        includeInactive,
        count: rows?.length,
      });
      return rows as Batch[];
    });
    return { data, error: null, success: true };
  });
}

/** Return a single batch by id. */
export async function getBatchById(id: string): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .select(BATCH_SELECT_COLUMNS)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Batch, error: null, success: true };
}

/** Return all students in a batch with joined user profile. */
export async function getBatchStudents(
  batchId: string,
  instituteId: string,
): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("id, user_id, admission_no, status, created_at, batch_id, user:users(id, name, email, phone, avatar_url)")
    .eq("batch_id", batchId)
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) {
    if (BATCH_DEBUG) {
      console.debug("[batch.service] getBatchStudents error", { batchId, instituteId, error });
    }
    return { data: null, error: error.message, success: false };
  }

  if (BATCH_DEBUG) {
    console.debug("[batch.service] getBatchStudents", {
      batchId,
      instituteId,
      count: data?.length ?? 0,
    });
  }

  return { data: data as Student[], error: null, success: true };
}

/** Return all students with no batch assigned yet. */
export async function getUnassignedStudents(instituteId: string): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("id, user_id, admission_no, status, created_at, batch_id, user:users(id, name, email, phone)")
    .eq("institute_id", instituteId)
    .is("batch_id", null)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student[], error: null, success: true };
}

export type StudentForBatchAssignment = Student & {
  batch?: { id: string; name: string } | null;
};

const STUDENT_ASSIGNMENT_SELECT =
  "id, user_id, admission_no, status, created_at, batch_id, user:users(id, name, email, phone)";

function isSchemaRelationshipError(message: string): boolean {
  return /relationship|schema cache|PGRST200/i.test(message);
}

/** Merge batch names without PostgREST embed (works when FK is not yet in schema cache). */
async function loadStudentsForBatchAssignmentManual(
  instituteId: string,
): Promise<ApiResponse<StudentForBatchAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select(STUDENT_ASSIGNMENT_SELECT)
    .eq("institute_id", instituteId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (studentsError) {
    return { data: null, error: getErrorMessage(studentsError), success: false };
  }

  const rows = (students ?? []) as StudentForBatchAssignment[];
  const batchIds = [
    ...new Set(rows.map((s) => s.batch_id).filter((id): id is string => Boolean(id))),
  ];

  const batchNameById = new Map<string, string>();
  if (batchIds.length > 0) {
    const { data: batches, error: batchesError } = await supabase
      .from("batches")
      .select("id, name")
      .eq("institute_id", instituteId)
      .in("id", batchIds);

    if (batchesError) {
      return { data: null, error: getErrorMessage(batchesError), success: false };
    }

    for (const b of batches ?? []) {
      batchNameById.set(b.id, b.name);
    }
  }

  const merged = rows.map((s) => ({
    ...s,
    batch:
      s.batch_id && batchNameById.has(s.batch_id)
        ? { id: s.batch_id, name: batchNameById.get(s.batch_id)! }
        : null,
  }));

  if (BATCH_DEBUG) {
    console.debug("[batch.service] getStudentsForBatchAssignment (manual join)", {
      instituteId,
      count: merged.length,
      batchIds: batchIds.length,
    });
  }

  return { data: merged, error: null, success: true };
}

/**
 * All active institute students for the assign-to-batch modal.
 * Includes students already in other batches so admins can move them.
 */
export async function getStudentsForBatchAssignment(
  instituteId: string,
): Promise<ApiResponse<StudentForBatchAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select(
      `${STUDENT_ASSIGNMENT_SELECT}, batch:batches(id, name)`,
    )
    .eq("institute_id", instituteId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    const message = getErrorMessage(error);
    if (BATCH_DEBUG) {
      console.debug("[batch.service] getStudentsForBatchAssignment embed failed", {
        instituteId,
        message,
      });
    }
    if (isSchemaRelationshipError(message)) {
      return loadStudentsForBatchAssignmentManual(instituteId);
    }
    return { data: null, error: message, success: false };
  }

  if (BATCH_DEBUG) {
    console.debug("[batch.service] getStudentsForBatchAssignment (embed)", {
      instituteId,
      count: data?.length,
    });
  }

  return { data: data as StudentForBatchAssignment[], error: null, success: true };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create a new batch. */
export async function createBatch(payload: CreateBatchPayload): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const insertRow = normalizeBatchInsert(payload);
  debugBatch("createBatch:payload", insertRow);

  const { data, error } = await supabase
    .from("batches")
    .insert(insertRow)
    .select(BATCH_SELECT_COLUMNS)
    .single();

  debugBatch("createBatch:response", { data, error });

  if (error) {
    return { data: null, error: getErrorMessage(error), success: false };
  }

  invalidateBatchesCache(payload.institute_id);
  return { data: data as Batch, error: null, success: true };
}

/** Update mutable batch fields. */
export async function updateBatch(
  id: string,
  payload: UpdateBatchPayload,
): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const updateRow = normalizeBatchUpdate(payload);
  if (Object.keys(updateRow).length === 0) {
    return { data: null, error: "No fields to update.", success: false };
  }

  debugBatch("updateBatch:payload", { id, updateRow });

  const { data, error } = await supabase
    .from("batches")
    .update(updateRow)
    .eq("id", id)
    .select(BATCH_SELECT_COLUMNS)
    .single();

  debugBatch("updateBatch:response", { data, error });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  if (data?.institute_id) invalidateBatchesCache(data.institute_id as string);
  return { data: data as Batch, error: null, success: true };
}

/** Soft-delete a batch by setting is_active = false. */
export async function archiveBatch(id: string): Promise<ApiResponse<Batch>> {
  return updateBatch(id, { is_active: false });
}

/** Restore a previously archived batch. */
export async function restoreBatch(id: string): Promise<ApiResponse<Batch>> {
  return updateBatch(id, { is_active: true });
}

/** Assign a single student to a batch. */
export async function assignStudentToBatch(
  studentId: string,
  batchId: string,
): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .update({ batch_id: batchId })
    .eq("id", studentId)
    .select("*, user:users(id, name, email, phone, role, is_active)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/** Remove a student from their current batch. */
export async function removeStudentFromBatch(studentId: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .update({ batch_id: null })
    .eq("id", studentId)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/** Assign multiple students to a batch in a single query. */
export async function bulkAssignStudentsToBatch(
  studentIds: string[],
  batchId: string,
): Promise<ApiResponse<{ count: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  if (studentIds.length === 0) return { data: { count: 0 }, error: null, success: true };

  const { data, error } = await supabase
    .from("students")
    .update({ batch_id: batchId })
    .in("id", studentIds)
    .select("id, batch_id");

  if (error) {
    if (BATCH_DEBUG) {
      console.debug("[batch.service] bulkAssignStudentsToBatch error", { batchId, studentIds, error });
    }
    return { data: null, error: error.message, success: false };
  }

  const count = (data ?? []).length;
  if (BATCH_DEBUG) {
    console.debug("[batch.service] bulkAssignStudentsToBatch", { batchId, requested: studentIds.length, updated: count });
  }

  return { data: { count }, error: null, success: true };
}

// ── Backwards-compatibility aliases ──────────────────────────────────────────

/** @deprecated Use getBatchesByInstitute */
export async function getActiveAttendanceBatches(
  instituteId: string,
): Promise<ApiResponse<Batch[]>> {
  return getBatchesByInstitute(instituteId, false);
}

/** @deprecated Use bulkAssignStudentsToBatch */
export async function assignStudentsToBatch(
  _instituteId: string,
  batchId: string,
  studentIds: string[],
): Promise<ApiResponse<{ count: number }>> {
  return bulkAssignStudentsToBatch(studentIds, batchId);
}

/** @deprecated Use bulkAssignStudentsToBatch with empty batchId */
export async function removeStudentsFromBatch(
  _instituteId: string,
  _batchId: string,
  studentIds: string[],
): Promise<ApiResponse<{ count: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const { data, error } = await supabase
    .from("students")
    .update({ batch_id: null })
    .in("id", studentIds)
    .select("id");
  if (error) return { data: null, error: error.message, success: false };
  return { data: { count: (data ?? []).length }, error: null, success: true };
}

/** @deprecated Use getUnassignedStudents */
export async function getAssignableStudents(
  instituteId: string,
  search = "",
): Promise<ApiResponse<Student[]>> {
  const result = await getUnassignedStudents(instituteId);
  if (!result.success || !result.data) return result;
  if (!search) return result;
  const q = search.toLowerCase();
  return {
    ...result,
    data: result.data.filter(
      (s) =>
        s.admission_no.toLowerCase().includes(q) || (s.user?.name ?? "").toLowerCase().includes(q),
    ),
  };
}

/** Return a student's batch info. */
export async function getStudentBatch(
  batchId: string,
  _instituteId: string,
): Promise<ApiResponse<{ id: string; name: string; academic_year: string } | null>> {
  if (!supabase) return { data: null, error: null, success: true };

  const { data, error } = await supabase
    .from("batches")
    .select("id, name, academic_year")
    .eq("id", batchId)
    .single();

  if (error) return { data: null, error: null, success: true };
  return {
    data: data as { id: string; name: string; academic_year: string },
    error: null,
    success: true,
  };
}
