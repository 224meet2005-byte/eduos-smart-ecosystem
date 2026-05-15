// ---------------------------------------------------------------------------
// EduOS — Fee Service
//
// All database operations for fee management live here.
// Tables: fee_categories, fee_structures, student_fees, fee_payments
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
import type {
  FeeStructure,
  FeeCategory,
  StudentFee,
  FeePayment,
  FeeStatus,
  RecordPaymentResult,
  RevenueStats,
  ApiResponse,
} from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Fee Structures ───────────────────────────────────────────────────────────

/**
 * Return all fee structures for an institute, newest first.
 * Joins the optional `fee_categories` relation for display purposes.
 */
export async function getFeeStructures(instituteId: string): Promise<ApiResponse<FeeStructure[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_structures")
    .select("*, category:fee_categories(*)")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeStructure[], error: null, success: true };
}

/**
 * Insert a new fee structure record.
 * The caller is responsible for ensuring `institute_id` belongs to the
 * currently signed-in admin (enforced by RLS on the server).
 */
export async function createFeeStructure(payload: {
  institute_id: string;
  name: string;
  amount: number;
  frequency: string;
  academic_year: string;
  description?: string;
  category_id?: string;
}): Promise<ApiResponse<FeeStructure>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_structures")
    .insert(payload)
    .select("*, category:fee_categories(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeStructure, error: null, success: true };
}

// ── Fee Categories ───────────────────────────────────────────────────────────

/**
 * Return all fee categories for an institute, sorted alphabetically.
 * Categories are used to group fee structures (e.g. Tuition, Transport).
 */
export async function getFeeCategories(instituteId: string): Promise<ApiResponse<FeeCategory[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_categories")
    .select("*")
    .eq("institute_id", instituteId)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeCategory[], error: null, success: true };
}

/**
 * Create a new fee category for an institute.
 */
export async function createFeeCategory(payload: {
  institute_id: string;
  name: string;
  description?: string;
}): Promise<ApiResponse<FeeCategory>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("fee_categories").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeeCategory, error: null, success: true };
}

// ── Student Fee Assignment ───────────────────────────────────────────────────

/**
 * Assign a fee structure to a specific student.
 *
 * The DB computes `final_amount = original_amount - discount_amount` and
 * initialises `paid_so_far = 0` and `status = 'pending'` automatically.
 */
export async function assignFeeToStudent(payload: {
  student_id: string;
  institute_id: string;
  fee_structure_id: string;
  assigned_by: string;
  original_amount: number;
  discount_amount: number;
  discount_reason?: string;
  due_date: string;
  academic_year: string;
}): Promise<ApiResponse<StudentFee>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_fees")
    .insert(payload)
    .select("*, fee_structure:fee_structures(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentFee, error: null, success: true };
}

/**
 * Return all fee assignments for a single student.
 * Joins the fee structure template and any existing payments so callers
 * have a complete picture without extra round-trips.
 */
export async function getStudentFees(studentId: string): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_fees")
    .select(
      `
      *,
      fee_structure:fee_structures(*),
      payments:fee_payments(*)
    `,
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentFee[], error: null, success: true };
}

/**
 * Return all student fee assignments for an institute.
 *
 * Each row includes the student profile (with linked `user`) and the
 * fee structure template.  Supports optional server-side filtering by
 * `status` and `academicYear`.
 */
export async function getInstituteStudentFees(
  instituteId: string,
  filters?: { status?: FeeStatus; academicYear?: string },
): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("student_fees")
    .select(
      `
      *,
      student:students(*, user:users(*)),
      fee_structure:fee_structures(*)
    `,
    )
    .eq("institute_id", instituteId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.academicYear) {
    query = query.eq("academic_year", filters.academicYear);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentFee[], error: null, success: true };
}

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * Record a fee payment against a student fee assignment.
 *
 * Delegates to the `record_fee_payment` Postgres RPC which atomically:
 *   1. Inserts a `fee_payments` row
 *   2. Updates `student_fees.paid_so_far`
 *   3. Recalculates and sets the new `status` (partial / paid / overdue)
 *   4. Generates and returns a sequential receipt number
 *
 * Returns a `RecordPaymentResult` with the receipt number and updated status
 * so the UI can reflect changes immediately without a follow-up query.
 */
export async function recordPayment(payload: {
  student_fee_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_ref?: string;
  notes?: string;
}): Promise<ApiResponse<RecordPaymentResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("record_fee_payment", {
    p_student_fee_id: payload.student_fee_id,
    p_amount: payload.amount,
    p_payment_method: payload.payment_method,
    p_payment_date: payload.payment_date,
    p_transaction_ref: payload.transaction_ref ?? null,
    p_notes: payload.notes ?? null,
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as RecordPaymentResult, error: null, success: true };
}

/**
 * Return the complete payment history for a student fee assignment.
 * Results are ordered newest-first (most recent payment at the top).
 */
export async function getPaymentHistory(studentFeeId: string): Promise<ApiResponse<FeePayment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("fee_payments")
    .select("*, collector:users!collected_by(id, name)")
    .eq("student_fee_id", studentFeeId)
    .order("payment_date", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as FeePayment[], error: null, success: true };
}

// ── Revenue Analytics ─────────────────────────────────────────────────────────

/**
 * Compute aggregated revenue statistics for an institute in a given
 * academic year.
 *
 * Implemented client-side to avoid a dedicated RPC:
 *  1. Fetch all `student_fees` for the institute + year to derive
 *     pending / overdue totals from `final_amount` and `paid_so_far`.
 *  2. Fetch all `fee_payments` for those fees to derive total collected
 *     and the current-month collection figure.
 *
 * Both queries run before any JavaScript computation begins, so the two
 * network round-trips are the only latency cost.
 */
export async function getRevenueStats(
  instituteId: string,
  academicYear: string,
): Promise<ApiResponse<RevenueStats>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // ── Step 1: Fetch fee assignments ──────────────────────────────────────────
  const { data: fees, error: feesError } = await supabase
    .from("student_fees")
    .select("id, final_amount, paid_so_far, status")
    .eq("institute_id", instituteId)
    .eq("academic_year", academicYear);

  if (feesError) return { data: null, error: feesError.message, success: false };

  const feeList = fees ?? [];
  const feeIds = feeList.map((f) => f.id as string);

  // Compute pending / overdue totals directly from student_fees metadata.
  let totalPending = 0;
  let totalOverdue = 0;

  for (const fee of feeList) {
    const remaining = Math.max(0, (fee.final_amount ?? 0) - (fee.paid_so_far ?? 0));
    if (fee.status === "pending" || fee.status === "partial") {
      totalPending += remaining;
    } else if (fee.status === "overdue") {
      totalOverdue += remaining;
    }
  }

  // ── Step 2: Early return when no fees exist for this year ─────────────────
  if (feeIds.length === 0) {
    return {
      data: {
        total_collected: 0,
        total_pending: totalPending,
        total_overdue: totalOverdue,
        collection_this_month: 0,
      },
      error: null,
      success: true,
    };
  }

  // ── Step 3: Fetch payments for these student fees ─────────────────────────
  const { data: payments, error: paymentsError } = await supabase
    .from("fee_payments")
    .select("amount, payment_date")
    .in("student_fee_id", feeIds);

  if (paymentsError) return { data: null, error: paymentsError.message, success: false };

  // ── Step 4: Compute collection totals ─────────────────────────────────────
  // ISO date prefix for the first day of the current calendar month.
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let totalCollected = 0;
  let collectionThisMonth = 0;

  for (const payment of payments ?? []) {
    const amt = payment.amount ?? 0;
    totalCollected += amt;
    // payment_date is stored as YYYY-MM-DD; string comparison works here.
    if ((payment.payment_date as string) >= firstOfMonth) {
      collectionThisMonth += amt;
    }
  }

  return {
    data: {
      total_collected: totalCollected,
      total_pending: totalPending,
      total_overdue: totalOverdue,
      collection_this_month: collectionThisMonth,
    },
    error: null,
    success: true,
  };
}

/**
 * Return all student fee assignments that still have an outstanding balance.
 *
 * Filters to `status IN ('pending', 'partial', 'overdue')` and orders by
 * `due_date ASC` so the most-urgent entries appear first.
 *
 * Each row is fully joined with:
 *  - `student → users`  (for name, admission number)
 *  - `fee_structure`    (for fee name and amount)
 *  - `payments`         (for payment history display)
 */
export async function getPendingDues(instituteId: string): Promise<ApiResponse<StudentFee[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_fees")
    .select(
      `
      *,
      student:students(*, user:users(*)),
      fee_structure:fee_structures(*),
      payments:fee_payments(*)
    `,
    )
    .eq("institute_id", instituteId)
    .in("status", ["pending", "partial", "overdue"])
    .order("due_date", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentFee[], error: null, success: true };
}
