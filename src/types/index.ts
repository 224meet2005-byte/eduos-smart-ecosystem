// ---------------------------------------------------------------------------
// EduOS — Shared Domain Types
// Every Supabase table row and every shared enum lives here.
// Services, stores, and components all import from '@/types'.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";

// ── Primitives ──────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin" // Platform owner — cross-institute visibility
  | "admin" // Institute administrator
  | "staff" // Staff member with teaching duties
  | "student" // Enrolled learner
  | "parent"; // Guardian linked to one or more students

export type SubscriptionPlan = "free" | "basic" | "pro" | "enterprise";

export type StudentStatus = "active" | "inactive" | "graduated" | "suspended";

export type BatchStatus = "active" | "inactive" | "archived";

export type RelationType = "father" | "mother" | "guardian" | "sibling" | "other";

// ── Generic API envelope ────────────────────────────────────────────────────

/**
 * Unified response wrapper used by every service function.
 * Consumers check `success` before accessing `data`.
 *
 * @template T  The shape of a successful payload.
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

// ── Core entities ───────────────────────────────────────────────────────────

/** Row in the `users` table (mirrors Supabase auth.users via a trigger). */
export interface User {
  id: string;
  institute_id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Row in the `institutes` table. */
export interface Institute {
  id: string;
  name: string;
  logo: string | null;
  subscription_plan: SubscriptionPlan;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Row in the `students` table. */
export interface Student {
  id: string;
  institute_id: string;
  user_id: string;
  admission_no: string;
  batch_id: string | null;
  status: StudentStatus;
  emergency_contact?: EmergencyContact | null;
  created_at: string;
  updated_at: string;

  // Joined relations (populated when select includes `user:users(*)`)
  user?: User;
  batch?: Batch;
}

/** Row in the `parents` table. */
export interface Parent {
  id: string;
  institute_id: string;
  user_id: string;
  occupation: string | null;
  created_at: string;
  updated_at: string;

  // Joined relations
  user?: User;
}

/**
 * Row in the `student_parents` join table.
 * Tracks which parent is linked to which student and the relationship type.
 */
export interface StudentParent {
  id: string;
  student_id: string;
  parent_id: string;
  relation_type: RelationType;
  created_at: string;

  // Joined relations
  student?: Student;
  parent?: Parent;
}

/** Same junction semantics as `StudentParent`; use for strict admission / ERP payloads. */
export type StudentParentRelation = Pick<
  StudentParent,
  "student_id" | "parent_id" | "relation_type"
>;

/** Row in the `staff` table. */
export interface Staff {
  id: string;
  institute_id: string;
  user_id: string;
  designation: string;
  department: string | null;
  created_at: string;
  updated_at: string;

  // Joined relations
  user?: User;
}

// ── Auth ───────────────────────────────────────────────────────────────────

/** Shape of global authentication state (used in Zustand + context). */
export interface AuthSession {
  user: User | null;
  institute: Institute | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ── Route Guards ────────────────────────────────────────────────────────────

/** Props accepted by ProtectedRoute / RoleGuard components. */
export interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children: ReactNode;
}

// ── Form Data (consumed by React Hook Form + Zod) ────────────────────────────

export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  /** Required when self-registering into an existing institute */
  institute_id?: string;
}

export interface PasswordResetFormData {
  email: string;
}

export interface PasswordUpdateFormData {
  password: string;
  confirmPassword: string;
}

// ── Batches ──────────────────────────────────────────────────────────────────

/** Row in the `batches` table (referenced by students). */
export interface Batch {
  id: string;
  institute_id: string;
  name: string;
  batch_code: string;
  course_name: string;
  start_date: string;
  end_date: string;
  capacity: number;
  status: BatchStatus;
  academic_year: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  student_count?: number;
}

export interface BatchStudent {
  id: string;
  batch_id: string;
  student_id: string;
  linked_at: string;
  student?: Student;
}

export interface StudentBatchInfo extends Batch {
  timing: string | null;
}

export interface CreateBatchPayload {
  institute_id: string;
  batch_name: string;
  batch_code: string;
  course_name: string;
  start_date: string;
  end_date: string;
  capacity: number;
  status: BatchStatus;
  academic_year: string;
}

export interface AttendanceBatchOption {
  id: string;
  name: string;
  course_name: string;
  label: string;
}

// ── Extended / Derived Types ─────────────────────────────────────────────────

/**
 * Emergency contact details stored alongside a student record.
 * Collected at admission and kept for urgent communication.
 */
export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

/**
 * Row in the `student_history` audit table.
 * Every change to a student record appends an immutable history entry.
 */
export interface StudentHistory {
  id: string;
  student_id: string;
  institute_id: string;
  changed_by: string;
  /** Discriminator: 'status_changed' | 'batch_updated' | 'remark_added' | 'admitted' */
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  remark: string | null;
  created_at: string;

  // Joined
  changed_by_user?: Pick<User, "id" | "name" | "role">;
}

/**
 * Row in the `activity_logs` table.
 * Records every significant user action platform-wide for auditing.
 */
export interface ActivityLog {
  id: string;
  institute_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;

  // Joined
  user?: Pick<User, "id" | "name" | "role">;
}

// ── Pagination ───────────────────────────────────────────────────────────────

/** Metadata returned alongside any paginated list response. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Generic paginated response envelope.
 * Use `PaginatedResponse<Student>`, `PaginatedResponse<Parent>`, etc.
 */
export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

// ── Student Feature Types ────────────────────────────────────────────────────

/**
 * Filter criteria accepted by `searchStudents`.
 * All fields are optional — omitting them returns unfiltered results.
 */
export interface StudentFilters {
  status?: StudentStatus;
  batchId?: string;
  /** Case-insensitive substring match against name, email, and admission_no. */
  search?: string;
}

/**
 * Full admission envelope for `admit_student` RPC.
 * Student and parent fields are logically separated; the RPC enforces the same split.
 */
export interface AdmitStudentPayload {
  institute_id: string;
  student_name: string;
  student_email: string;
  phone: string;
  admission_number: string;
  batch_id: string | null;
  /** Last four digits only; optional legacy field for the RPC. */
  aadhaar_last4: string | null;
  emergency_contact: EmergencyContact | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  parent_occupation: string | null;
  parent_relation_type: RelationType | null;
}

/**
 * Student-only slice of admission (no parent PII).
 */
export type StudentAdmissionPayload = Pick<
  AdmitStudentPayload,
  | "institute_id"
  | "student_name"
  | "student_email"
  | "phone"
  | "admission_number"
  | "batch_id"
  | "aadhaar_last4"
  | "emergency_contact"
>;

/**
 * Parent-only slice for admission.
 */
export type ParentAdmissionPayload = Pick<
  AdmitStudentPayload,
  "parent_name" | "parent_email" | "parent_phone" | "parent_occupation" | "parent_relation_type"
>;

/** Student profile plus how this parent is related (admin parent panel). */
export type StudentLinkedForParent = Student & { relation_type: RelationType };

/**
 * Shape returned by the `admit_student` RPC on success.
 * Callers can use these IDs to navigate to the new student's profile.
 */
export interface AdmitStudentResult {
  student_id: string;
  user_id: string;
  admission_no: string;
}

// ── Lifecycle Management ─────────────────────────────────────────────────────

/**
 * Discriminated union of all student lifecycle actions.
 * Drives both the `student_promotions.action` column and the
 * `LifecycleActionModal` UI.
 */
export type LifecycleAction =
  | "promoted"
  | "graduated"
  | "suspended"
  | "reactivated"
  | "transferred";

/**
 * Row in the `student_promotions` table.
 * Recorded whenever a lifecycle action is performed on a student.
 * Complements `StudentHistory` with structured before/after status data
 * and an explicit reason field.
 */
export interface StudentPromotion {
  id: string;
  student_id: string;
  institute_id: string;
  /** The lifecycle action that was performed. */
  action: LifecycleAction;
  from_status: StudentStatus;
  to_status: StudentStatus;
  from_batch_id: string | null;
  to_batch_id: string | null;
  reason: string;
  notes: string | null;
  effective_date: string;
  /** FK to `users.id` — the staff/admin who performed the action. */
  promoted_by: string | null;
  created_at: string;

  // Joined relations (populated when select includes the promoted_by_user join)
  promoted_by_user?: Pick<User, "id" | "name" | "role">;
}

/**
 * Row in the `student_documents` table.
 * Stores metadata for documents uploaded against a student profile.
 * Actual file bytes live in Supabase Storage; only the URL is kept here.
 */
export interface StudentDocument {
  id: string;
  student_id: string;
  institute_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;

  // Joined relations
  uploaded_by_user?: Pick<User, "id" | "name" | "role">;
}

// ── Courses ──────────────────────────────────────────────────────────────────

export type CourseEnrollmentStatus = "active" | "completed" | "dropped";

export interface Course {
  id: string;
  institute_id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentCourse {
  id: string;
  student_id: string;
  course_id: string;
  institute_id: string;
  enrolled_at: string;
  status: CourseEnrollmentStatus;
  course?: Course;
  student?: Student;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceStatus = "present" | "absent" | "late" | "leave";
export type AttendanceSessionType = "daily" | "lecture";

export interface AttendanceSession {
  id: string;
  institute_id: string;
  batch_id: string | null;
  course_id: string | null;
  conducted_by: string;
  session_date: string;
  session_type: AttendanceSessionType;
  topic: string | null;
  is_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  batch?: Batch;
  course?: Course;
  conductor?: Pick<User, "id" | "name">;
  record_count?: number;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  institute_id: string;
  status: AttendanceStatus;
  notes: string | null;
  marked_by: string;
  marked_at: string;
  student?: Student;
  marker?: Pick<User, "id" | "name">;
}

export interface StudentAttendanceRecord extends AttendanceRecord {
  session?: AttendanceSession & { batch?: Batch };
}

export interface AttendanceTrendPoint {
  label: string;
  period: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  percentage: number;
}

export interface StudentAttendanceStats {
  student_id: string;
  total_sessions: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
  present_percentage: number;
  absent_percentage: number;
  late_percentage: number;
  leave_percentage: number;
  monthly_trend: AttendanceTrendPoint[];
  weekly_trend: AttendanceTrendPoint[];
}

export interface StudentDashboardData {
  student: Student;
  batch: StudentBatchInfo | null;
  stats: StudentAttendanceStats;
  history: StudentAttendanceRecord[];
}

export interface AttendanceSummary {
  student_id: string;
  student_name: string;
  admission_no: string;
  total_sessions: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
}

export interface BulkAttendanceEntry {
  student_id: string;
  status: AttendanceStatus;
  notes?: string;
}

// ── Fee Management ────────────────────────────────────────────────────────────

export type FeeFrequency = "one_time" | "monthly" | "quarterly" | "annual";
export type FeeStatus = "pending" | "partial" | "paid" | "overdue" | "waived";
export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "cheque" | "card";

export interface FeeCategory {
  id: string;
  institute_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FeeStructure {
  id: string;
  institute_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  frequency: FeeFrequency;
  academic_year: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: FeeCategory;
}

export interface StudentFee {
  id: string;
  student_id: string;
  institute_id: string;
  fee_structure_id: string;
  assigned_by: string;
  original_amount: number;
  discount_amount: number;
  discount_reason: string | null;
  final_amount: number;
  /** Running sum of all confirmed payments — updated by `record_fee_payment` RPC. */
  paid_so_far: number;
  due_date: string;
  status: FeeStatus;
  academic_year: string;
  created_at: string;
  updated_at: string;
  fee_structure?: FeeStructure;
  student?: Student;
  payments?: FeePayment[];
}

export interface FeePayment {
  id: string;
  student_fee_id: string;
  student_id: string;
  institute_id: string;
  /** User who collected / recorded the payment (FK to users.id). */
  collected_by: string;
  amount: number;
  payment_method: PaymentMethod;
  /** ISO date string YYYY-MM-DD. */
  payment_date: string;
  transaction_ref: string | null;
  notes: string | null;
  /** Generated receipt number — non-null after the `record_fee_payment` RPC. */
  receipt_number: string | null;
  created_at: string;
  collector?: Pick<User, "id" | "name">;
}

export interface FeeReceipt {
  id: string;
  payment_id: string;
  institute_id: string;
  receipt_number: string;
  receipt_data: ReceiptData;
  generated_at: string;
  generated_by: string;
}

export interface ReceiptData {
  receipt_number: string;
  payment_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_ref: string | null;
  student_fee_id: string;
}

export interface RecordPaymentResult {
  payment_id: string;
  /** Generated receipt number, e.g. RCP-202501-00001. */
  receipt_number: string;
  new_status: FeeStatus;
  /** Balance remaining after this payment (INR). */
  remaining_amount: number;
}

export interface RevenueStats {
  total_collected: number;
  total_pending: number;
  total_overdue: number;
  collection_this_month: number;
}

// ── Security Events ───────────────────────────────────────────────────────────

export type SecurityEventType =
  | "failed_login"
  | "permission_denied"
  | "suspicious_upload"
  | "rate_limit"
  | "invalid_token";
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export interface SecurityEvent {
  id: string;
  institute_id: string | null;
  user_id: string | null;
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
