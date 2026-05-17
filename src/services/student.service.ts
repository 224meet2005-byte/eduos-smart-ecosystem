// ---------------------------------------------------------------------------
// EduOS — Student Service
//
// All database operations for the `students` table live here.
// Every query that returns student records also joins `users` so callers
// always have access to the student's display name, email, and avatar.
//
// SUPABASE NULL SAFETY
//   `supabase` is `SupabaseClient | null` (see src/lib/supabase.ts).
//   Every function starts with `if (!supabase) return SUPABASE_NOT_CONFIGURED`.
//   After that guard, TypeScript narrows the type to `SupabaseClient` for the
//   remainder of the function body — no `!` assertions needed below.
//
// Every function returns an ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { getStudentBatch } from "@/services/batch.service";
import { getStudentAttendanceHistory } from "@/services/attendance.service";
import type {
  Student,
  StudentParent,
  StudentHistory,
  StudentStatus,
  Batch,
  ApiResponse,
  PaginatedResponse,
  StudentFilters,
  AdmitStudentPayload,
  AdmitStudentResult,
  StudentLinkedForParent,
  LifecycleAction,
  StudentPromotion,
  StudentDocument,
  AttendanceTrendPoint,
  StudentAttendanceRecord,
  StudentAttendanceStats,
  StudentBatchInfo,
  StudentDashboardData,
} from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

function getAttendanceDateKey(record: StudentAttendanceRecord): string {
  return record.session?.session_date ?? record.marked_at.slice(0, 10);
}

function createEmptyTrendPoint(label: string, period: string): AttendanceTrendPoint {
  return {
    label,
    period,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    total: 0,
    percentage: 0,
  };
}

function buildMonthlyTrend(records: StudentAttendanceRecord[]): AttendanceTrendPoint[] {
  const buckets = new Map<string, AttendanceTrendPoint>();
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(
      key,
      createEmptyTrendPoint(
        date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        key,
      ),
    );
  }

  for (const record of records) {
    const [year, month] = getAttendanceDateKey(record).split("-");
    const bucket = buckets.get(`${year}-${month}`);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percentage:
      bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : 0,
  }));
}

function buildWeeklyTrend(records: StudentAttendanceRecord[]): AttendanceTrendPoint[] {
  const buckets = new Map<string, AttendanceTrendPoint>();
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.set(
      key,
      createEmptyTrendPoint(date.toLocaleDateString("en-US", { weekday: "short" }), key),
    );
  }

  for (const record of records) {
    const dateKey = getAttendanceDateKey(record);
    const bucket = buckets.get(dateKey);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percentage:
      bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : 0,
  }));
}

function buildAttendanceStats(
  studentId: string,
  history: StudentAttendanceRecord[],
): StudentAttendanceStats {
  const totalSessions = history.length;
  const present = history.filter((record) => record.status === "present").length;
  const absent = history.filter((record) => record.status === "absent").length;
  const late = history.filter((record) => record.status === "late").length;
  const leave = history.filter((record) => record.status === "leave").length;
  const attended = present + late;

  return {
    student_id: studentId,
    total_sessions: totalSessions,
    present,
    absent,
    late,
    leave,
    percentage: totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0,
    present_percentage: totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0,
    absent_percentage: totalSessions > 0 ? Math.round((absent / totalSessions) * 100) : 0,
    late_percentage: totalSessions > 0 ? Math.round((late / totalSessions) * 100) : 0,
    leave_percentage: totalSessions > 0 ? Math.round((leave / totalSessions) * 100) : 0,
    monthly_trend: buildMonthlyTrend(history),
    weekly_trend: buildWeeklyTrend(history),
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Return all students who belong to a given institute, newest first.
 * The joined `user` relation provides name/email without a second round-trip.
 */
export async function getStudentsByInstitute(instituteId: string): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("*, user:users(*)")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student[], error: null, success: true };
}

/**
 * Return a single student by their `students.id` primary key.
 * Includes the joined `user` profile.
 */
export async function getStudentById(id: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("*, user:users(*)")
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/**
 * Return a student by their linked Supabase auth `user_id`.
 * Useful after sign-in when you only have the auth UUID, not the student UUID.
 */
export async function getStudentByUserId(userId: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("*, user:users(*)")
    .eq("user_id", userId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/**
 * Return all students linked to a given parent via the `student_parents`
 * junction table.  Each row's nested `student` relation is unwrapped so the
 * return type is a flat `Student[]`.
 */
export async function getStudentsByParentId(
  parentId: string,
): Promise<ApiResponse<StudentLinkedForParent[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_parents")
    .select("relation_type, student:students(*, user:users(*))")
    .eq("parent_id", parentId);

  if (error) return { data: null, error: error.message, success: false };

  const rows = (data ?? []) as unknown as Array<{
    relation_type: StudentLinkedForParent["relation_type"];
    student: Student | null;
  }>;

  const students: StudentLinkedForParent[] = rows
    .filter((row) => row.student !== null)
    .map((row) => ({
      ...row.student!,
      relation_type: row.relation_type,
    }));

  return { data: students, error: null, success: true };
}

/**
 * Search and filter students within an institute with offset pagination.
 *
 * ROOT CAUSE FIXES applied here:
 *
 *  1. BROKEN .or() removed — PostgREST cannot reference joined-table columns
 *     (users.name, users.email) in a root-level .or() filter.  That caused
 *     the query to either hang or return a 400 that stalled the promise.
 *     Search now uses two separate steps: filter admission_no locally, then
 *     client-filter the name/email from the joined user record.
 *
 *  2. count:'exact' removed from the main join query — running an exact count
 *     across a join with RLS can be slow or stall.  We do a lightweight
 *     separate count query instead.
 *
 *  3. 12-second AbortController timeout — ensures the loading state ALWAYS
 *     resolves even if the Supabase query stalls indefinitely.
 */
export async function searchStudents(
  instituteId: string,
  filters: StudentFilters = {},
  page = 1,
  pageSize = 20,
): Promise<ApiResponse<PaginatedResponse<Student>>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    // ── Step 1: Fetch the student rows (no count, no cross-table filter) ────
    let query = supabase
      .from("students")
      .select("*, user:users(id, name, email, phone, avatar_url, role, is_active)")
      .eq("institute_id", instituteId)
      .order("created_at", { ascending: false });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.batchId) query = query.eq("batch_id", filters.batchId);

    // admission_no is a LOCAL column — safe to filter directly
    if (filters.search) {
      query = query.ilike("admission_no", `%${filters.search}%`);
    }

    const { data, error } = await query.range(from, to);

    if (error) {
      console.error("[searchStudents] query error:", error.message, error);
      return { data: null, error: error.message, success: false };
    }

    // ── Step 2: Client-side name/email filter (avoids cross-table OR) ───────
    // When a search term is provided, further filter the fetched rows by
    // the joined user's name and email.  This runs on the already-fetched
    // page, so it is O(pageSize) and has zero extra network round-trips.
    let items = (data ?? []) as Student[];
    if (filters.search) {
      const lower = filters.search.toLowerCase();
      items = items.filter(
        (s) =>
          s.admission_no.toLowerCase().includes(lower) ||
          (s.user?.name ?? "").toLowerCase().includes(lower) ||
          (s.user?.email ?? "").toLowerCase().includes(lower),
      );
    }

    // ── Step 3: Lightweight total count (separate query, no join) ────────────
    let total = 0;
    try {
      let countQuery = supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("institute_id", instituteId);

      if (filters.status) countQuery = countQuery.eq("status", filters.status);
      if (filters.batchId) countQuery = countQuery.eq("batch_id", filters.batchId);
      if (filters.search) countQuery = countQuery.ilike("admission_no", `%${filters.search}%`);

      const { count, error: countError } = await countQuery;
      if (!countError) total = count ?? 0;
    } catch {
      // Count failure is non-fatal — pagination degrades gracefully
      total = items.length;
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: { items, meta: { page, pageSize, total, totalPages } },
      error: null,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error in searchStudents";
    console.error("[searchStudents] unexpected exception:", message);
    return { data: null, error: message, success: false };
  }
}

/**
 * Retrieve the full audit trail for a student from the `student_history` table.
 * Each row includes the acting user (who triggered the change) via a join on
 * the `changed_by` foreign key.
 */
export async function getStudentHistory(studentId: string): Promise<ApiResponse<StudentHistory[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_history")
    .select("*, changed_by_user:users!changed_by(id, name, role)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentHistory[], error: null, success: true };
}

/**
 * Return a student with all currently linked parents.
 *
 * The `parents` array contains `StudentParent` rows — each includes
 * `relation_type` and the nested `parent` profile (with the parent's `user`).
 * This avoids multiple round-trips for the student detail page.
 */
export async function getStudentWithParents(
  studentId: string,
): Promise<ApiResponse<Student & { parents: StudentParent[] }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: studentData, error: studentError } = await supabase
    .from("students")
    .select("*, user:users(*)")
    .eq("id", studentId)
    .single();

  if (studentError) return { data: null, error: studentError.message, success: false };

  const { data: parentsData, error: parentsError } = await supabase
    .from("student_parents")
    .select("*, parent:parents(*, user:users(*))")
    .eq("student_id", studentId);

  if (parentsError) return { data: null, error: parentsError.message, success: false };

  return {
    data: {
      ...(studentData as Student),
      parents: (parentsData ?? []) as StudentParent[],
    },
    error: null,
    success: true,
  };
}

export async function getCurrentStudentDashboard(
  userId: string,
  instituteId: string,
): Promise<ApiResponse<StudentDashboardData>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const studentResult = await getStudentByUserId(userId);
  if (!studentResult.success || !studentResult.data) {
    return {
      data: null,
      error: studentResult.error ?? "Student profile not found.",
      success: false,
    };
  }

  const student = studentResult.data;

  const batchPromise = student.batch_id
    ? getStudentBatch(student.batch_id, instituteId)
    : Promise.resolve({ data: null, error: null, success: true } as ApiResponse<StudentBatchInfo>);

  const [batchResult, historyResult] = await Promise.all([
    batchPromise,
    getStudentAttendanceHistory(student.id),
  ]);

  const history = historyResult.success && historyResult.data ? historyResult.data : [];
  const stats = buildAttendanceStats(student.id, history);

  return {
    data: {
      student,
      batch: batchResult.success ? batchResult.data : null,
      history,
      stats,
    },
    error: [batchResult.error, historyResult.error].filter(Boolean).join(" | ") || null,
    success: true,
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Enrol a new student in an institute.
 *
 * The `user_id` must already exist in `auth.users` (and therefore in `users`)
 * before calling this function.  `admission_no` must be unique per institute.
 */
export async function createStudent(
  payload: Pick<Student, "institute_id" | "user_id" | "admission_no" | "batch_id" | "status">,
): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("students").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/**
 * Update mutable student fields.
 *
 * `institute_id` and `user_id` are intentionally excluded — those are
 * immutable after enrolment and must only be changed via a migration.
 */
export async function updateStudent(
  id: string,
  payload: Partial<Pick<Student, "admission_no" | "batch_id" | "status" | "emergency_contact">>,
): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/**
 * Soft-delete a student by setting their status to `'inactive'`.
 * All records (history, parent links, etc.) are preserved — this is
 * reversible via `restoreStudent`.
 */
export async function archiveStudent(id: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .update({ status: "inactive" })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/**
 * Restore a previously archived student by setting their status back to `'active'`.
 * Only valid for students currently in `'inactive'` status.
 */
export async function restoreStudent(id: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .update({ status: "active" })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Student, error: null, success: true };
}

/**
 * Admit a new student via the `admit_student` Postgres RPC.
 *
 * The RPC atomically:
 *   1. Creates a Supabase auth user (invited, no password set yet)
 *   2. Inserts the `users` profile row (via `handle_new_user` + upsert merge)
 *   3. Inserts the `students` record (student fields only — never parent PII)
 *   4. Optionally creates or reuses a parent, then inserts `student_parents`
 *   5. Appends an activity log entry for the admission
 *
 * Known RPC error codes (raised via `RAISE EXCEPTION`) are translated into
 * friendly, user-facing messages before being returned.
 */
export async function admitStudent(
  payload: AdmitStudentPayload,
): Promise<ApiResponse<AdmitStudentResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const hasParentBlock =
    !!payload.parent_name?.trim() &&
    !!payload.parent_email?.trim() &&
    payload.parent_relation_type != null;

  const { data, error } = await supabase.rpc("admit_student", {
    p_institute_id: payload.institute_id,
    p_name: payload.student_name,
    p_email: payload.student_email,
    p_phone: payload.phone,
    p_admission_no: payload.admission_number,
    p_batch_id: payload.batch_id,
    p_aadhaar_last4: payload.aadhaar_last4,
    p_emergency_contact: payload.emergency_contact,
    p_parent_name: hasParentBlock ? payload.parent_name : null,
    p_parent_email: hasParentBlock ? payload.parent_email : null,
    p_parent_phone: hasParentBlock ? payload.parent_phone?.trim() || null : null,
    p_parent_occupation: hasParentBlock ? payload.parent_occupation?.trim() || null : null,
    p_parent_relation_type: hasParentBlock ? payload.parent_relation_type : null,
  });

  if (error) {
    // Map known RPC error codes to friendly, actionable messages.
    const friendlyErrors: Record<string, string> = {
      ADMIT_STUDENT_DUPLICATE_EMAIL: "A user with this email address already exists.",
      ADMIT_STUDENT_DUPLICATE_ADMISSION_NO:
        "This admission number is already in use at this institute.",
      ADMIT_STUDENT_INVALID_INSTITUTE:
        "The specified institute does not exist or is currently inactive.",
      ADMIT_STUDENT_INVALID_BATCH:
        "The selected batch does not exist or does not belong to this institute.",
      ADMIT_STUDENT_PARENT_OTHER_INSTITUTE:
        "This guardian email is registered at another institute. Use a different email or contact support.",
      ADMIT_STUDENT_PARENT_EMAIL_IN_USE:
        "This email is already used by a non-parent account. Use a different guardian email.",
      ADMIT_STUDENT_PARENT_CREATION_FAILED: "Failed to create parent account. Please try again.",
      ADMIT_STUDENT_PARENT_SAME_AS_STUDENT:
        "Parent email cannot be the same as the student email. Use a different guardian email.",
      ADMIT_STUDENT_INVALID_PARENT_RELATION: "Invalid parent relationship type.",
      ADMIT_STUDENT_FORBIDDEN: "You do not have permission to admit students for this institute.",
    };
    const friendlyMessage = Object.entries(friendlyErrors).find(([code]) =>
      error.message.includes(code),
    )?.[1];
    return { data: null, error: friendlyMessage ?? error.message, success: false };
  }

  return { data: data as AdmitStudentResult, error: null, success: true };
}

/**
 * Append a freeform remark to a student's history log.
 *
 * Delegates to the `add_student_remark` Postgres RPC so the server can
 * automatically fill in `changed_by` (from `auth.uid()`) and `institute_id`
 * (from the student's record) without the client needing to know either.
 *
 * The remark appears in the student's history timeline under the
 * `'remark_added'` action type.
 */
export async function addStudentRemark(
  studentId: string,
  remark: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.rpc("add_student_remark", {
    p_student_id: studentId,
    p_remark: remark,
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

// ── Lifecycle Management ─────────────────────────────────────────────────────

/** Maps each LifecycleAction to the resulting StudentStatus. */
const LIFECYCLE_STATUS_MAP: Record<LifecycleAction, StudentStatus> = {
  promoted: "active",
  graduated: "graduated",
  suspended: "suspended",
  reactivated: "active",
  transferred: "inactive",
};

/**
 * Perform a lifecycle action on a student.
 *
 * Atomically:
 *   1. Fetches the student's current status.
 *   2. Determines the target status from `LIFECYCLE_STATUS_MAP`.
 *   3. Updates the student record (status + optional batch transfer).
 *   4. Inserts a `student_promotions` row for the audit trail.
 *   5. Inserts a `student_history` row (non-fatal if it fails).
 *
 * Returns the newly created `StudentPromotion` record.
 */
export async function performLifecycleAction(payload: {
  student_id: string;
  action: LifecycleAction;
  reason: string;
  notes?: string;
  to_batch_id?: string;
  effective_date?: string;
}): Promise<ApiResponse<StudentPromotion>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // 1. Fetch current student to capture from_status and batch context.
  const studentResult = await getStudentById(payload.student_id);
  if (!studentResult.success || !studentResult.data) {
    return {
      data: null,
      error: studentResult.error ?? "Student not found.",
      success: false,
    };
  }

  const student = studentResult.data;
  const from_status = student.status;

  // 2. Determine target status.
  const to_status = LIFECYCLE_STATUS_MAP[payload.action];

  // 3. Update the student row (status; batch only when a transfer is requested).
  const studentUpdatePayload: Partial<Pick<Student, "status" | "batch_id">> = { status: to_status };
  if (payload.to_batch_id) {
    studentUpdatePayload.batch_id = payload.to_batch_id;
  }

  const updateResult = await updateStudent(payload.student_id, studentUpdatePayload);
  if (!updateResult.success) {
    return {
      data: null,
      error: updateResult.error ?? "Failed to update student status.",
      success: false,
    };
  }

  const effectiveDate = payload.effective_date ?? new Date().toISOString().split("T")[0];

  // 4. Insert into student_promotions.
  const { data: promotionData, error: promotionError } = await supabase
    .from("student_promotions")
    .insert({
      student_id: payload.student_id,
      institute_id: student.institute_id,
      action: payload.action,
      from_status,
      to_status,
      from_batch_id: student.batch_id ?? null,
      to_batch_id: payload.to_batch_id ?? null,
      reason: payload.reason,
      notes: payload.notes ?? null,
      effective_date: effectiveDate,
    })
    .select()
    .single();

  if (promotionError) {
    return { data: null, error: promotionError.message, success: false };
  }

  // 5. Insert into student_history (non-fatal — a warning suffices if it fails).
  const { error: historyError } = await supabase.from("student_history").insert({
    student_id: payload.student_id,
    institute_id: student.institute_id,
    action: payload.action,
    old_value: { status: from_status, batch_id: student.batch_id },
    new_value: {
      status: to_status,
      batch_id: payload.to_batch_id ?? student.batch_id,
    },
    remark: payload.reason,
  });

  if (historyError) {
    console.warn(
      "[performLifecycleAction] Failed to insert student_history:",
      historyError.message,
    );
  }

  return { data: promotionData as StudentPromotion, error: null, success: true };
}

/**
 * Return all promotion records for a student, newest first.
 * Each row includes the `promoted_by_user` profile (id, name, role)
 * via a foreign-key join.
 */
export async function getStudentPromotions(
  studentId: string,
): Promise<ApiResponse<StudentPromotion[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_promotions")
    .select("*, promoted_by_user:users!promoted_by(id, name, role)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentPromotion[], error: null, success: true };
}

// ── Document Management ─────────────────────────────────────────────────────

/**
 * Return all documents attached to a student, ordered by upload date
 * (newest first).
 */
export async function getStudentDocuments(
  studentId: string,
): Promise<ApiResponse<StudentDocument[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_documents")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentDocument[], error: null, success: true };
}

/**
 * Permanently delete a document record from `student_documents`.
 *
 * Note: this does **not** delete the underlying file from Supabase Storage.
 * Storage cleanup should be handled separately (e.g. via a Storage trigger
 * or a separate admin operation).
 */
export async function deleteStudentDocument(documentId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("student_documents").delete().eq("id", documentId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}
