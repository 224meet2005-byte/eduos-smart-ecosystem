// ---------------------------------------------------------------------------
// EduOS — Course Service
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { Course, ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

/** Return all courses for an institute. */
export async function getCoursesByInstitute(
  instituteId: string,
  activeOnly = true,
): Promise<ApiResponse<Course[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("courses")
    .select("*")
    .eq("institute_id", instituteId)
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Course[], error: null, success: true };
}
