// ---------------------------------------------------------------------------
// EduOS — Staff Service
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/utils/helpers";
import { generateStaffCredentials } from "@/utils/staffCredentials";
import type {
  AdmitStaffPayload,
  AdmitStaffResult,
  ApiResponse,
  Batch,
  Staff,
  StaffAssignment,
  StaffBatchAssignment,
  StaffBatchOption,
} from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Return all staff members for a given institute, newest first.
 * The joined `user` relation provides name, email, and avatar_url.
 */
export async function getStaffByInstitute(instituteId: string): Promise<ApiResponse<Staff[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff")
    .select("*, user:users(*)")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff[], error: null, success: true };
}

/**
 * Return the staff record linked to a Supabase auth user.
 * Called immediately after sign-in to hydrate teacher/staff-specific state.
 */
export async function getStaffByUserId(userId: string): Promise<ApiResponse<Staff>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff")
    .select("*, user:users(*)")
    .eq("user_id", userId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff, error: null, success: true };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Add a new staff member to an institute.
 *
 * The `user_id` must already exist in `auth.users` (and therefore in `users`)
 * before calling this function.  One user can only hold one staff record per
 * institute — duplicates are rejected by the database's unique constraint.
 */
export async function createStaff(
  payload: Pick<Staff, "institute_id" | "user_id" | "designation" | "department">,
): Promise<ApiResponse<Staff>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("staff").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff, error: null, success: true };
}

/**
 * Update a staff member's designation and/or department.
 *
 * `institute_id` and `user_id` are intentionally excluded from the payload —
 * those are immutable after creation and must only be changed via a migration.
 */
export async function updateStaff(
  id: string,
  payload: Partial<Pick<Staff, "designation" | "department">>,
): Promise<ApiResponse<Staff>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff, error: null, success: true };
}

/**
 * Permanently remove a staff record from an institute.
 *
 * This does NOT delete the linked `users` row — the person's auth account
 * remains intact.  To fully offboard a user, also call `signOut()` and
 * deactivate the user via the admin API if required.
 */
export async function removeStaff(id: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("staff").delete().eq("id", id);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Return all course / batch assignments for a staff member.
 */
export async function getStaffAssignments(
  staffId: string,
): Promise<ApiResponse<StaffAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff_assignments")
    .select("*, batch:batches(*)")
    .eq("staff_id", staffId)
    .order("assigned_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as StaffAssignment[], error: null, success: true };
}

/**
 * Return only batch assignment rows for a staff member.
 */
export async function getStaffBatchAssignments(
  staffId: string,
): Promise<ApiResponse<StaffBatchAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff_assignments")
    .select("*, batch:batches(*)")
    .eq("staff_id", staffId)
    .not("batch_id", "is", null)
    .is("course_name", null)
    .is("subject_name", null)
    .order("assigned_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as StaffBatchAssignment[], error: null, success: true };
}

/**
 * Return active batches that can be assigned to staff.
 */
export async function getAssignableBatchOptions(
  instituteId: string,
): Promise<ApiResponse<StaffBatchOption[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("institute_id", instituteId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as StaffBatchOption[], error: null, success: true };
}

/**
 * Assign a batch to a staff member.
 */
export async function assignBatchToStaff(payload: {
  institute_id: string;
  staff_id: string;
  batch_id: string;
  assigned_by: string | null;
}): Promise<ApiResponse<StaffBatchAssignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff_assignments")
    .insert({
      institute_id: payload.institute_id,
      staff_id: payload.staff_id,
      batch_id: payload.batch_id,
      course_name: null,
      subject_name: null,
      assigned_by: payload.assigned_by,
    })
    .select("*, batch:batches(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StaffBatchAssignment, error: null, success: true };
}

/**
 * Remove a staff batch assignment.
 */
export async function removeStaffBatchAssignment(payload: {
  assignment_id: string;
  staff_id: string;
}): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("staff_assignments")
    .delete()
    .eq("id", payload.assignment_id)
    .eq("staff_id", payload.staff_id);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Admit a new staff member and create their initial credentials.
 */
export async function admitStaff(
  payload: AdmitStaffPayload,
): Promise<ApiResponse<AdmitStaffResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { temporaryPassword } = generateStaffCredentials(payload.name);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: payload.email,
    password: temporaryPassword,
    options: {
      data: {
        name: payload.name,
        role: "staff",
        institute_id: payload.institute_id,
      },
    },
  });

  if (authError || !authData.user) {
    return {
      data: null,
      error: authError?.message ?? "Failed to create staff auth account.",
      success: false,
    };
  }

  const { data: profileData, error: profileError } = await supabase.rpc("create_staff_profile", {
    p_user_id: authData.user.id,
    p_institute_id: payload.institute_id,
    p_name: payload.name,
    p_email: payload.email,
    p_phone: payload.phone,
    p_designation: payload.designation,
    p_department: payload.department,
    p_qualification: payload.qualification,
    p_joining_date: payload.joining_date,
    p_role_name: payload.role_name,
  });

  if (profileError) {
    return { data: null, error: profileError.message, success: false };
  }

  const staffId =
    typeof profileData === "object" && profileData && "staff_id" in profileData
      ? String((profileData as { staff_id?: string }).staff_id ?? authData.user.id)
      : authData.user.id;

  const assignmentRows = (payload.assignments ?? [])
    .filter(
      (assignment) => assignment.batch_id || assignment.course_name || assignment.subject_name,
    )
    .map((assignment) => ({
      institute_id: payload.institute_id,
      staff_id: staffId,
      batch_id: assignment.batch_id || null,
      course_name: assignment.course_name || null,
      subject_name: assignment.subject_name || null,
      assigned_by: authData.user.id,
    }));

  if (assignmentRows.length > 0) {
    const { error: assignmentError } = await supabase
      .from("staff_assignments")
      .insert(assignmentRows);
    if (assignmentError) {
      return { data: null, error: assignmentError.message, success: false };
    }
  }

  return {
    data: {
      staff_id: staffId,
      user_id: authData.user.id,
      email: payload.email,
      temporary_password: temporaryPassword,
      role_name: payload.role_name,
      assignments: payload.assignments,
    },
    error: null,
    success: true,
  };
}

/**
 * Generate and deliver a new staff password-reset flow.
 */
export async function resetStaffPassword(
  userId: string,
): Promise<ApiResponse<{ temporary_password: string }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: staffData, error: staffError } = await supabase
    .from("staff")
    .select("*, user:users(*)")
    .eq("user_id", userId)
    .single();

  if (staffError || !staffData) {
    return { data: null, error: staffError?.message ?? "Staff record not found.", success: false };
  }

  const email = staffData.user?.email;
  if (!email) {
    return { data: null, error: "Unable to find the staff email address.", success: false };
  }

  const { temporaryPassword } = generateStaffCredentials(staffData.user?.name ?? "Staff");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${import.meta.env.VITE_APP_URL}/auth/update-password`,
  });

  if (error) {
    return { data: null, error: getErrorMessage(error), success: false };
  }

  return {
    data: { temporary_password: temporaryPassword },
    error: null,
    success: true,
  };
}
