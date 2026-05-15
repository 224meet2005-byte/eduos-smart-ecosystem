import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";

import {
  batchSchema as batchFormSchema,
  type BatchSchema as BatchFormSchema,
} from "@/modules/batches/validations";
import type { Batch, CreateBatchPayload } from "@/types";

interface BatchFormModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  batch?: Batch | null;
  onClose: () => void;
  onSubmitBatch: (payload: CreateBatchPayload | Partial<CreateBatchPayload>) => Promise<{
    success: boolean;
    error: string | null;
  }>;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-foreground";

function deriveAcademicYear(startDate: string): string {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const startYear = start.getFullYear();
  const endYear = (startYear + 1).toString().slice(-2);
  return `${startYear}-${endYear}`;
}

function defaultValues(batch?: Batch | null): BatchFormSchema {
  const start = batch?.start_date ?? new Date().toISOString().slice(0, 10);

  return {
    name: batch?.name ?? "",
    batch_code: batch?.batch_code ?? "",
    course_name: batch?.course_name ?? "",
    start_date: start,
    end_date: batch?.end_date ?? start,
    capacity: batch?.capacity ?? 60,
    academic_year: batch?.academic_year ?? deriveAcademicYear(start),
  };
}

export function BatchFormModal({
  isOpen,
  mode,
  batch,
  onClose,
  onSubmitBatch,
}: BatchFormModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const defaults = useMemo(() => defaultValues(batch), [batch]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BatchFormSchema>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: defaults,
  });

  const startDate = watch("start_date");

  useEffect(() => {
    reset(defaults);
    setServerError(null);
  }, [defaults, reset]);

  useEffect(() => {
    if (mode === "create" && startDate) {
      setValue("academic_year", deriveAcademicYear(startDate), { shouldDirty: true });
    }
  }, [mode, setValue, startDate]);

  async function onSubmit(values: BatchFormSchema) {
    setServerError(null);

    const payload = {
      name: values.name.trim(),
      batch_code: (values.batch_code ?? "").trim().toUpperCase() || undefined,
      course_name: (values.course_name ?? "").trim() || undefined,
      start_date: values.start_date,
      end_date: values.end_date,
      capacity: values.capacity ? Number(values.capacity) : undefined,
      academic_year: values.academic_year.trim(),
    };

    const result = await onSubmitBatch(payload);

    if (!result.success) {
      setServerError(result.error ?? "Unable to save batch");
      return;
    }

    onClose();
  }

  function handleClose() {
    reset(defaults);
    setServerError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Create Batch" : "Edit Batch"}
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold text-foreground">
          {mode === "create" ? "Create Batch" : "Edit Batch"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a batch so attendance and student grouping can work correctly.
        </p>

        {serverError && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div>
            <label htmlFor="batch_name" className={LABEL_CLASS}>
              Batch Name
            </label>
            <input id="batch_name" {...register("name")} className={INPUT_CLASS} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="batch_code" className={LABEL_CLASS}>
              Batch Code
            </label>
            <input id="batch_code" {...register("batch_code")} className={INPUT_CLASS} />
            {errors.batch_code && (
              <p className="mt-1 text-xs text-destructive">{errors.batch_code.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="course_name" className={LABEL_CLASS}>
              Course Name
            </label>
            <input id="course_name" {...register("course_name")} className={INPUT_CLASS} />
            {errors.course_name && (
              <p className="mt-1 text-xs text-destructive">{errors.course_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="academic_year" className={LABEL_CLASS}>
              Academic Year
            </label>
            <input id="academic_year" {...register("academic_year")} className={INPUT_CLASS} />
            {errors.academic_year && (
              <p className="mt-1 text-xs text-destructive">{errors.academic_year.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="start_date" className={LABEL_CLASS}>
              Start Date
            </label>
            <input
              id="start_date"
              type="date"
              {...register("start_date")}
              className={INPUT_CLASS}
            />
            {errors.start_date && (
              <p className="mt-1 text-xs text-destructive">{errors.start_date.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="end_date" className={LABEL_CLASS}>
              End Date
            </label>
            <input id="end_date" type="date" {...register("end_date")} className={INPUT_CLASS} />
            {errors.end_date && (
              <p className="mt-1 text-xs text-destructive">{errors.end_date.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="capacity" className={LABEL_CLASS}>
              Capacity
            </label>
            <input
              id="capacity"
              type="number"
              min={1}
              {...register("capacity")}
              className={INPUT_CLASS}
            />
            {errors.capacity && (
              <p className="mt-1 text-xs text-destructive">{errors.capacity.message}</p>
            )}
          </div>

          <div className="col-span-1 mt-2 flex items-center justify-end gap-3 md:col-span-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "create" ? "Create Batch" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
