import { z } from "zod";

export const batchStatusSchema = z.enum(["active", "inactive", "archived"]);

export const batchFormSchema = z
  .object({
    batch_name: z
      .string()
      .min(2, "Batch name must be at least 2 characters")
      .max(100, "Batch name is too long"),
    batch_code: z
      .string()
      .min(2, "Batch code must be at least 2 characters")
      .max(30, "Batch code is too long")
      .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, dash, underscore"),
    course_name: z
      .string()
      .min(2, "Course name must be at least 2 characters")
      .max(100, "Course name is too long"),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    capacity: z.coerce
      .number({ invalid_type_error: "Capacity must be a number" })
      .int("Capacity must be a whole number")
      .min(1, "Capacity must be at least 1")
      .max(20000, "Capacity is too high"),
    status: batchStatusSchema,
    academic_year: z
      .string()
      .min(4, "Academic year is required")
      .max(20, "Academic year is too long"),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.end_date) < new Date(value.start_date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after start date",
        path: ["end_date"],
      });
    }
  });

export type BatchFormSchema = z.infer<typeof batchFormSchema>;

export const assignStudentsSchema = z.object({
  student_ids: z.array(z.string().uuid()).min(1, "Select at least one student"),
});

export type AssignStudentsSchema = z.infer<typeof assignStudentsSchema>;
