// ---------------------------------------------------------------------------
// EduOS — Batch Service
// Full CRUD for the `batches` table + student assignment operations.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { Batch, Student, CreateBatchPayload, UpdateBatchPayload, ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Queries ───────────────────────────────────────────────────────────────────

/** Return all batches for an institute, with student count. */
export async function getBatchesWithStudentCount(
  instituteId: string,
): Promise<ApiResponse<(Batch & { student_count: number })[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };

  const { data: studentRows, error: studentError } = await supabase
    .from("students")
    .select("batch_id")
    .eq("institute_id", instituteId);

  if (studentError) return { data: null, error: studentError.message, success: false };

  const studentCounts = new Map<string, number>();
  for (const row of studentRows ?? []) {
    if (!row.batch_id) continue;
    studentCounts.set(row.batch_id, (studentCounts.get(row.batch_id) ?? 0) + 1);
  }

  const items = (data ?? []).map((row) => {
    return { ...row, student_count: studentCounts.get(row.id) ?? 0 };
  });

  return { data: items, error: null, success: true };
}

/** Return active batches only (used by attendance page dropdown). */
export async function getBatchesByInstitute(
  instituteId: string,
  includeInactive = false,
): Promise<ApiResponse<Batch[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("batches")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Batch[], error: null, success: true };
}

/** Return a single batch by id. */
export async function getBatchById(id: string): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("batches").select("*").eq("id", id).single();

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
    .select("*, user:users(id, name, email, phone, role, is_active, avatar_url)")
    .eq("batch_id", batchId)
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student[], error: null, success: true };
}

/** Return all students with no batch assigned yet (for the assign-students modal). */
export async function getUnassignedStudents(instituteId: string): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("*, user:users(id, name, email, phone, role, is_active)")
    .eq("institute_id", instituteId)
    .is("batch_id", null)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student[], error: null, success: true };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create a new batch. */
export async function createBatch(payload: CreateBatchPayload): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("batches").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Batch, error: null, success: true };
}

/** Update mutable batch fields. */
export async function updateBatch(
  id: string,
  payload: UpdateBatchPayload,
): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
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
    .select("id");

  if (error) return { data: null, error: error.message, success: false };
  return { data: { count: (data ?? []).length }, error: null, success: true };
}

// ── Backwards-compatibility aliases ──────────────────────────────────────────
// These keep pre-existing components working after the batch service was unified.

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

  if (error) return { data: null, error: null, success: true }; // non-fatal
  return {
    data: data as { id: string; name: string; academic_year: string },
    error: null,
    success: true,
  };
}
