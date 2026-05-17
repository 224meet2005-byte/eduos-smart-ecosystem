// ---------------------------------------------------------------------------
// EduOS — LMS Course Service
//
// All database operations for lms_courses and lms_categories tables.
// Follows the same null-safe Supabase pattern as student.service.ts.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { publishCourseCurriculum } from "@/modules/courses/services/curriculum.service";
import type {
  ApiResponse,
  LmsCourse,
  LmsCategory,
  LmsCourseWithCurriculum,
  LmsEnrollment,
  LmsLesson,
  LmsLessonMaterial,
  LmsCourseStatus,
  LmsDifficulty,
  CreateCoursePayload,
} from "@/types";

// ── List / filter types ───────────────────────────────────────────────────────

export interface CourseListFilters {
  search?: string;
  status?: LmsCourseStatus;
  difficulty?: LmsDifficulty;
  category_id?: string;
  /** Limit results to courses created by a specific user (staff-scoped view) */
  created_by?: string;
  page?: number;
  pageSize?: number;
}

export interface CourseListResult {
  items: LmsCourse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CourseStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  totalEnrollments: number;
}

// ── Shared "not configured" error response ───────────────────────────────────
const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Utility ───────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "course"}-${suffix}`;
}

/** Columns that may be written via create/update — excludes joins and counters. */
const COURSE_WRITABLE_KEYS = [
  "title",
  "subtitle",
  "description",
  "category_id",
  "difficulty",
  "language",
  "tags",
  "estimated_duration_mins",
  "visibility",
  "pricing",
  "price",
  "prerequisites",
  "learning_outcomes",
  "thumbnail_url",
  "thumbnail_storage_path",
  "intro_video_url",
  "intro_video_storage_path",
  "status",
  "published_at",
  "is_featured",
] as const;

function sanitizeCoursePayload(
  payload: Partial<LmsCourse> | CreateCoursePayload,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const key of COURSE_WRITABLE_KEYS) {
    if (!(key in payload)) continue;
    const value = (payload as Record<string, unknown>)[key];
    if (value === undefined) continue;
    out[key] = value;
  }

  if (out.category_id === "") out.category_id = null;
  if (out.subtitle === "") out.subtitle = null;
  if (out.description === "") out.description = null;
  if (typeof out.price === "number") out.price = Number(out.price);

  return out;
}

// ── Course CRUD ───────────────────────────────────────────────────────────────

export async function createCourse(
  payload: CreateCoursePayload,
  instituteId: string,
  userId: string,
): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const slug = generateSlug(payload.title);
  const fields = sanitizeCoursePayload(payload);

  const { data, error } = await supabase
    .from("lms_courses")
    .insert({
      ...fields,
      institute_id: instituteId,
      created_by: userId,
      slug,
      status: "draft",
      total_modules: 0,
      total_lessons: 0,
      total_enrollments: 0,
      total_completions: 0,
      is_featured: false,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  return { data: data as LmsCourse, error: null, success: true };
}

export async function updateCourse(
  courseId: string,
  updates: Partial<LmsCourse>,
): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const sanitizedUpdates = sanitizeCoursePayload(updates);

  const { data, error } = await supabase
    .from("lms_courses")
    .update({ ...sanitizedUpdates, updated_at: new Date().toISOString() })
    .eq("id", courseId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  return { data: data as LmsCourse, error: null, success: true };
}

export async function getCourseById(courseId: string): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_courses")
    .select("*, category:lms_categories(*)")
    .eq("id", courseId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsCourse, error: null, success: true };
}

function sortCurriculum(course: LmsCourseWithCurriculum): LmsCourseWithCurriculum {
  if (!course.modules?.length) {
    course.modules = [];
    return course;
  }

  course.modules = course.modules
    .sort((a, b) => a.position - b.position)
    .map((mod) => ({
      ...mod,
      lessons: (mod.lessons ?? []).sort((a, b) => a.position - b.position),
    }));

  return course;
}

/** Attach flat lesson rows to modules when nested embed returns empty lesson arrays (RLS edge cases). */
function mergeLessonsIntoModules(
  modules: LmsCourseWithCurriculum["modules"],
  flatLessons: Array<LmsLesson & { materials?: LmsLessonMaterial[] }>,
): LmsCourseWithCurriculum["modules"] {
  const byModule = new Map<string, typeof flatLessons>();
  for (const lesson of flatLessons) {
    const list = byModule.get(lesson.module_id) ?? [];
    list.push(lesson);
    byModule.set(lesson.module_id, list);
  }

  return modules.map((mod) => {
    const nested = mod.lessons ?? [];
    const merged =
      nested.length > 0
        ? nested
        : (byModule.get(mod.id) ?? []).sort((a, b) => a.position - b.position);
    return { ...mod, lessons: merged };
  });
}

export async function getCourseWithCurriculum(
  courseId: string,
  instituteId?: string,
): Promise<ApiResponse<LmsCourseWithCurriculum>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("lms_courses")
    .select(
      `
      *,
      category:lms_categories(*),
      modules:lms_modules(
        *,
        lessons:lms_lessons(
          *,
          materials:lms_lesson_materials(*)
        )
      )
    `,
    )
    .eq("id", courseId);

  if (instituteId) {
    query = query.eq("institute_id", instituteId);
  }

  const { data, error } = await query.single();

  if (error) return { data: null, error: error.message, success: false };

  let course = sortCurriculum(data as LmsCourseWithCurriculum);

  const nestedLessonCount = course.modules?.reduce((n, m) => n + (m.lessons?.length ?? 0), 0) ?? 0;
  const moduleCount = course.modules?.length ?? 0;

  // Fallback: fetch lessons directly and merge (handles nested RLS filtering quirks)
  if (moduleCount > 0 && nestedLessonCount === 0) {
    const { data: flatLessons, error: lessonsError } = await supabase
      .from("lms_lessons")
      .select("*, materials:lms_lesson_materials(*)")
      .eq("course_id", courseId)
      .order("position", { ascending: true });

    if (!lessonsError && flatLessons && flatLessons.length > 0) {
      course = {
        ...course,
        modules: mergeLessonsIntoModules(course.modules ?? [], flatLessons as LmsLesson[]),
      };
      course = sortCurriculum(course);
    }
  }

  return { data: course, error: null, success: true };
}

// ── Enrollment (backward-compat for student learning route) ─────────────────

export async function getStudentEnrollment(
  courseId: string,
  studentId: string,
  instituteId?: string,
): Promise<ApiResponse<LmsEnrollment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("lms_enrollments")
    .select("*")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .in("status", ["active", "completed"]);

  if (instituteId) {
    query = query.eq("institute_id", instituteId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  if (!data) {
    return {
      data: null,
      error: "You are not enrolled in this course or your enrollment is inactive.",
      success: false,
    };
  }
  return { data: data as LmsEnrollment, error: null, success: true };
}

/** Published courses visible to students in their institute (RLS-scoped). */
export async function listPublishedCoursesForStudent(
  instituteId: string,
  filters: Pick<
    CourseListFilters,
    "search" | "page" | "pageSize" | "difficulty" | "category_id"
  > = {},
): Promise<ApiResponse<CourseListResult>> {
  return listCourses(instituteId, { ...filters, status: "published" });
}

// ── List with filters & pagination ───────────────────────────────────────────

export async function listCourses(
  instituteId: string,
  filters: CourseListFilters = {},
): Promise<ApiResponse<CourseListResult>> {
  if (!supabase) return { data: null, error: "Supabase is not configured.", success: false };

  const { search, status, difficulty, category_id, created_by, page = 1, pageSize = 12 } = filters;

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(50, pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("lms_courses")
    .select("*, category:lms_categories(*)", { count: "exact" })
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) query = query.ilike("title", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (category_id) query = query.eq("category_id", category_id);
  if (created_by) query = query.eq("created_by", created_by);

  const { data, error, count } = await query;

  if (error) return { data: null, error: error.message, success: false };

  const total = count ?? 0;
  return {
    data: {
      items: (data ?? []) as LmsCourse[],
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
    error: null,
    success: true,
  };
}

// ── Publish / Archive / Delete ────────────────────────────────────────────────

export async function publishCourse(courseId: string): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("lms_courses")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", courseId)
    .select("*")
    .single();
  if (error) return { data: null, error: error.message, success: false };

  const publishCurriculum = await publishCourseCurriculum(courseId);
  if (!publishCurriculum.success) {
    return {
      data: data as LmsCourse,
      error: publishCurriculum.error ?? "Course published but curriculum sync failed",
      success: true,
    };
  }

  return { data: data as LmsCourse, error: null, success: true };
}

export async function archiveCourse(courseId: string): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("lms_courses")
    .update({ status: "archived", updated_at: now })
    .eq("id", courseId)
    .select("*")
    .single();
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsCourse, error: null, success: true };
}

export async function deleteCourse(courseId: string): Promise<ApiResponse<{ id: string }>> {
  if (!supabase) return { data: null, error: "Supabase is not configured.", success: false };
  const { error } = await supabase.from("lms_courses").delete().eq("id", courseId);
  if (error) return { data: null, error: error.message, success: false };
  return { data: { id: courseId }, error: null, success: true };
}

// ── Aggregate stats ───────────────────────────────────────────────────────────

export async function getCourseStats(
  instituteId: string,
  createdBy?: string,
): Promise<ApiResponse<CourseStats>> {
  if (!supabase) return { data: null, error: "Supabase is not configured.", success: false };

  let query = supabase
    .from("lms_courses")
    .select("status, total_enrollments")
    .eq("institute_id", instituteId);

  if (createdBy) query = query.eq("created_by", createdBy);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };

  const rows = (data ?? []) as { status: LmsCourseStatus; total_enrollments: number }[];
  return {
    data: {
      total: rows.length,
      published: rows.filter((c) => c.status === "published").length,
      draft: rows.filter((c) => c.status === "draft").length,
      archived: rows.filter((c) => c.status === "archived").length,
      totalEnrollments: rows.reduce((sum, c) => sum + (c.total_enrollments || 0), 0),
    },
    error: null,
    success: true,
  };
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories(instituteId: string): Promise<ApiResponse<LmsCategory[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_categories")
    .select("*")
    .eq("institute_id", instituteId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as LmsCategory[], error: null, success: true };
}
