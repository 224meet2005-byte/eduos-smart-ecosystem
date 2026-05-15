// ---------------------------------------------------------------------------
// EduOS — Student Module Validations
//
// Zod schemas for all student-related forms.
//
// Usage:
//   import { admissionSchema, type AdmissionSchema } from "@/modules/students/validations"
// ---------------------------------------------------------------------------

import { z } from "zod";

// ── Reusable field definitions ────────────────────────────────────────────────

/** International phone number — allows optional leading +, digits, spaces, and separators. */
const phoneField = z
  .string()
  .min(10, "Phone number must be at least 10 digits")
  .max(15, "Phone number must be 15 digits or fewer")
  .regex(/^\+?[0-9\s\-().]+$/, "Please enter a valid phone number");

// ── Admission schema ──────────────────────────────────────────────────────────

/**
 * Zod schema for the "Admit Student" form.
 *
 * Sections:
 *  1. Personal info   — full name, email, phone (all required)
 *  2. Academic        — admission number (required), batch (optional text)
 *  3. Emergency contact — name, phone, relationship (all optional)
 *  4. Parent details  — name, email, phone, occupation, relationship (optional)
 *
 * Design notes:
 *  - `aadhaarLast4` uses `z.preprocess` to coerce an empty string to
 *    `undefined` before the regex runs, so an empty field passes validation.
 *  - All optional string fields use `.optional()` rather than `.nullable()`
 *    because HTML inputs produce `""` or `undefined`, never `null`.
 *  - Parent section is optional — if parent_name is provided, parent_email
 *    and parent_relation_type are required. Otherwise all parent fields ignored.
 */
export const admissionSchema = z.object({
  // ── Section 1 — Personal Info ─────────────────────────────────────────────
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be 100 characters or fewer"),

  email: z.string().email("Please enter a valid email address"),

  phone: phoneField,

  // ── Section 2 — Academic ──────────────────────────────────────────────────
  admissionNo: z
    .string()
    .min(1, "Admission number is required")
    .max(50, "Admission number must be 50 characters or fewer"),

  /**
   * Batch identifier — free-text for now until the batch-selector widget
   * is wired to live backend data.
   */
  batchId: z.string().max(100).optional(),

  // (Identity section removed: Aadhaar is not collected)

  // ── Section 4 — Emergency Contact ────────────────────────────────────────
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyRelationship: z.string().max(50).optional(),

  // ── Section 5 — Parent Details ───────────────────────────────────────────
  /**
   * If parent_name is provided, parent_email and parent_relation_type are required.
   * If parent_name is empty, all parent fields are ignored.
   * This allows admins to optionally create a parent during student admission.
   */
  parentName: z.string().max(100).optional(),
  parentEmail: z.string().email().optional(),
  parentPhone: phoneField.optional(),
  parentOccupation: z.string().max(100).optional(),
  parentRelationType: z
    .enum(["father", "mother", "guardian", "sibling", "other"])
    .optional(),
}).refine(
  (data) => {
    // If parent_name is provided, require email and relation type
    if (data.parentName) {
      return !!data.parentEmail && !!data.parentRelationType;
    }
    // If parent_name is not provided, parent section is optional
    return true;
  },
  {
    message: "If providing parent details, parent email and relationship type are required",
    path: ["parentName"],
  },
);

/** TypeScript type inferred from `admissionSchema`. Use with `useForm<AdmissionSchema>`. */
export type AdmissionSchema = z.infer<typeof admissionSchema>;

// ── Remark schema ─────────────────────────────────────────────────────────────

/**
 * Schema for the "Add Remark" modal textarea.
 * Enforces minimum content so trivially short remarks are rejected early.
 */
export const remarkSchema = z.object({
  remark: z
    .string()
    .min(3, "Remark must be at least 3 characters")
    .max(500, "Remark must be 500 characters or fewer"),
});

/** TypeScript type inferred from `remarkSchema`. Use with `useForm<RemarkSchema>`. */
export type RemarkSchema = z.infer<typeof remarkSchema>;
