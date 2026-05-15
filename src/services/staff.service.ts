// ---------------------------------------------------------------------------
// EduOS — Staff Service
//
// All database operations for the `staff` table live here.
// "Staff" covers teachers, coordinators, and any other non-student employee
// of an institute.  Role-based access restrictions (e.g. only admin can
// remove staff) are enforced at the route/guard layer, not here.
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
import type { Staff, ApiResponse } from "@/types";

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
