// ---------------------------------------------------------------------------
// EduOS — Admin: Batch Management Page (/dashboard/admin/batches)
// ---------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  GraduationCap,
  AlertCircle,
  Users,
  Calendar,
  Hash,
  BookOpen,
  MoreHorizontal,
  Archive,
  RefreshCw,
  Pencil,
  UserPlus,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { useAuthStore } from "@/store/authStore";
import {
  getBatchesWithStudentCount,
  createBatch,
  updateBatch,
  archiveBatch,
  restoreBatch,
  getUnassignedStudents,
  bulkAssignStudentsToBatch,
} from "@/services/batch.service";
import { batchSchema, type BatchSchema } from "@/modules/batches/validations";
import { formatDate } from "@/utils/helpers";
import type { Batch, Student } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/batches/")({
  head: () => ({ meta: [{ title: "Batches — EduOS" }] }),
  component: BatchesPage,
});

// ── Style constants ───────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

// ── BatchForm (shared Create / Edit) ─────────────────────────────────────────

interface BatchFormProps {
  title: string;
  defaultValues?: Partial<BatchSchema>;
  isSubmitting: boolean;
  serverError: string | null;
  onSubmit: (values: BatchSchema) => Promise<void>;
  onCancel: () => void;
}

function BatchForm({
  title,
  defaultValues,
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
}: BatchFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BatchSchema>({
    resolver: zodResolver(batchSchema),
    defaultValues: defaultValues ?? {
      academic_year:
        new Date().getFullYear() + "-" + String(new Date().getFullYear() + 1).slice(-2),
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="bf-name">
            Batch Name <span className="text-destructive">*</span>
          </label>
          <input
            id="bf-name"
            type="text"
            placeholder="e.g. JEE 2025 Morning Batch"
            {...register("name")}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Academic Year */}
        <div>
          <label className={LABEL_CLASS} htmlFor="bf-year">
            Academic Year <span className="text-destructive">*</span>
          </label>
          <input
            id="bf-year"
            type="text"
            placeholder="2024-25"
            {...register("academic_year")}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
          {errors.academic_year && (
            <p className="mt-1 text-xs text-destructive">{errors.academic_year.message}</p>
          )}
        </div>

        {/* Batch Code */}
        <div>
          <label className={LABEL_CLASS} htmlFor="bf-code">
            Batch Code <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="bf-code"
            type="text"
            placeholder="e.g. JEE-M-2025"
            {...register("batch_code")}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
        </div>

        {/* Course Name */}
        <div>
          <label className={LABEL_CLASS} htmlFor="bf-course">
            Course Name{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="bf-course"
            type="text"
            placeholder="e.g. JEE Advanced"
            {...register("course_name")}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
        </div>

        {/* Capacity */}
        <div>
          <label className={LABEL_CLASS} htmlFor="bf-cap">
            Capacity <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="bf-cap"
            type="number"
            min={1}
            max={1000}
            placeholder="e.g. 40"
            {...register("capacity", { valueAsNumber: true })}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
        </div>

        {/* Start Date */}
        <div>
          <label className={LABEL_CLASS} htmlFor="bf-start">
            Start Date <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="bf-start"
            type="date"
            {...register("start_date")}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
        </div>

        {/* End Date */}
        <div>
          <label className={LABEL_CLASS} htmlFor="bf-end">
            End Date <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="bf-end"
            type="date"
            {...register("end_date")}
            className={INPUT_CLASS}
            disabled={isSubmitting}
          />
          {errors.end_date && (
            <p className="mt-1 text-xs text-destructive">{errors.end_date.message}</p>
          )}
        </div>

        {/* Description */}
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="bf-desc">
            Description{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="bf-desc"
            rows={2}
            placeholder="Brief description of this batch..."
            {...register("description")}
            className={INPUT_CLASS + " resize-none"}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Saving…" : "Save Batch"}
        </button>
      </div>
    </form>
  );
}

// ── BatchCard ─────────────────────────────────────────────────────────────────

interface BatchCardProps {
  batch: Batch & { student_count?: number };
  onEdit: (b: Batch) => void;
  onArchive: (b: Batch) => void;
  onRestore: (b: Batch) => void;
  onAssign: (b: Batch) => void;
}

function BatchCard({ batch, onEdit, onArchive, onRestore, onAssign }: BatchCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`relative rounded-xl border bg-card p-5 transition-shadow hover:shadow-md ${batch.is_active ? "border-border" : "border-border/50 opacity-70"}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${batch.is_active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${batch.is_active ? "bg-green-500" : "bg-muted-foreground"}`}
          />
          {batch.is_active ? "Active" : "Inactive"}
        </span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-border bg-card shadow-lg py-1">
              <button
                onClick={() => {
                  onEdit(batch);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={() => {
                  onAssign(batch);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <UserPlus className="h-3.5 w-3.5" /> Assign Students
              </button>
              {batch.is_active ? (
                <button
                  onClick={() => {
                    onArchive(batch);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              ) : (
                <button
                  onClick={() => {
                    onRestore(batch);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Restore
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Name + Course */}
      <h3 className="text-sm font-semibold text-foreground leading-tight">{batch.name}</h3>
      {batch.course_name && (
        <p className="text-xs text-muted-foreground mt-0.5">{batch.course_name}</p>
      )}
      <p className="text-xs text-muted-foreground mt-0.5">{batch.academic_year}</p>

      {/* Stats */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {batch.student_count ?? 0} students
          {batch.capacity ? ` / ${batch.capacity}` : ""}
        </span>
        {batch.batch_code && (
          <span className="flex items-center gap-1">
            <Hash className="h-3.5 w-3.5" />
            {batch.batch_code}
          </span>
        )}
        {batch.start_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(batch.start_date)}
          </span>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onAssign(batch)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" /> Assign Students
        </button>
        <button
          onClick={() => onEdit(batch)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── AssignStudentsPanel ────────────────────────────────────────────────────────

interface AssignStudentsPanelProps {
  batch: Batch;
  instituteId: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

function AssignStudentsPanel({ batch, instituteId, onClose, onSuccess }: AssignStudentsPanelProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getUnassignedStudents(instituteId).then((res) => {
      if (res.success && res.data) setStudents(res.data);
      setIsLoading(false);
    });
  }, [instituteId]);

  const filtered = useMemo(() => {
    if (!search) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        s.admission_no.toLowerCase().includes(q) ||
        (s.user?.name ?? "").toLowerCase().includes(q) ||
        (s.user?.email ?? "").toLowerCase().includes(q),
    );
  }, [students, search]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((s) => s.id)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setIsSaving(true);
    setError(null);
    const result = await bulkAssignStudentsToBatch(Array.from(selected), batch.id);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error ?? "Assignment failed.");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      onSuccess(result.data?.count ?? selected.size);
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Assign Students</h2>
            <p className="text-xs text-muted-foreground">to {batch.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-sm font-medium text-foreground">
              {selected.size} student{selected.size !== 1 ? "s" : ""} assigned to {batch.name}
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search by name, email or admission no…"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {students.length === 0
                      ? "All students are assigned to batches."
                      : "No students match your search."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Select all */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <label
                      htmlFor="select-all"
                      className="text-xs font-medium text-foreground cursor-pointer"
                    >
                      Select all ({filtered.length})
                    </label>
                  </div>
                  {filtered.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded border-border accent-primary shrink-0"
                      />
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(s.user?.name ?? "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {s.user?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.admission_no} · {s.user?.email}
                        </p>
                      </div>
                    </label>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border p-4 flex items-center justify-between gap-3">
              {error && <p className="text-xs text-destructive flex-1">{error}</p>}
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <button
                onClick={handleAssign}
                disabled={selected.size === 0 || isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving
                  ? "Assigning…"
                  : `Assign ${selected.size > 0 ? selected.size : ""} Students`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function BatchesPage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? null;

  const [batches, setBatches] = useState<(Batch & { student_count: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [assignBatch, setAssignBatch] = useState<Batch | null>(null);

  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchBatches = useCallback(async () => {
    if (!instituteId) return;
    setIsLoading(true);
    setError(null);
    const result = await getBatchesWithStudentCount(instituteId);
    if (result.success && result.data) setBatches(result.data);
    else setError(result.error ?? "Failed to load batches.");
    setIsLoading(false);
  }, [instituteId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = batches;
    if (statusFilter !== "all")
      list = list.filter((b) => (statusFilter === "active" ? b.is_active : !b.is_active));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.batch_code ?? "").toLowerCase().includes(q) ||
          (b.course_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [batches, statusFilter, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (values: BatchSchema) => {
    if (!instituteId) return;
    setIsSubmitting(true);
    setFormError(null);
    const result = await createBatch({ ...values, institute_id: instituteId });
    setIsSubmitting(false);
    if (!result.success || !result.data) {
      setFormError(result.error ?? "Failed to create batch.");
      return;
    }
    setBatches((prev) => [{ ...result.data!, student_count: 0 }, ...prev]);
    setShowCreate(false);
  };

  const handleEdit = async (values: BatchSchema) => {
    if (!editingBatch) return;
    setIsSubmitting(true);
    setFormError(null);
    const result = await updateBatch(editingBatch.id, values);
    setIsSubmitting(false);
    if (!result.success || !result.data) {
      setFormError(result.error ?? "Failed to update batch.");
      return;
    }
    setBatches((prev) =>
      prev.map((b) =>
        b.id === editingBatch.id ? { ...result.data!, student_count: b.student_count } : b,
      ),
    );
    setEditingBatch(null);
  };

  const handleArchive = async (batch: Batch) => {
    const result = await archiveBatch(batch.id);
    if (result.success)
      setBatches((prev) => prev.map((b) => (b.id === batch.id ? { ...b, is_active: false } : b)));
  };

  const handleRestore = async (batch: Batch) => {
    const result = await restoreBatch(batch.id);
    if (result.success)
      setBatches((prev) => prev.map((b) => (b.id === batch.id ? { ...b, is_active: true } : b)));
  };

  const handleAssignSuccess = (count: number) => {
    if (assignBatch)
      setBatches((prev) =>
        prev.map((b) =>
          b.id === assignBatch.id ? { ...b, student_count: (b.student_count ?? 0) + count } : b,
        ),
      );
    setAssignBatch(null);
    fetchBatches(); // refresh to get accurate counts
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <PageHeader
        title="Batches"
        subtitle="Group students into batches for attendance and course management"
        badge={isLoading ? "— batches" : `${batches.length} batches`}
        actions={
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Batch
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search batches…"
          className="w-full sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {/* Content */}
      <div className="mt-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                <div className="h-4 w-16 bg-muted rounded mb-3" />
                <div className="h-4 w-40 bg-muted rounded mb-2" />
                <div className="h-3 w-24 bg-muted rounded mb-4" />
                <div className="h-8 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <GraduationCap className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {search || statusFilter !== "all"
                  ? "No batches match your filters"
                  : "No batches yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filter."
                  : "Create your first batch to start assigning students and managing attendance."}
              </p>
            </div>
            {!search && statusFilter === "all" && (
              <button
                onClick={() => {
                  setFormError(null);
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Create First Batch
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                onEdit={setEditingBatch}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onAssign={setAssignBatch}
              />
            ))}
          </div>
        )}
      </div>

      {/* Attendance CTA */}
      {batches.length > 0 && (
        <div className="mt-8 rounded-xl border border-border bg-card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Ready to take attendance?</p>
              <p className="text-xs text-muted-foreground">
                Your batches are now available in the Attendance module.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/admin/attendance"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            Go to Attendance →
          </Link>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <BatchForm
              title="Create New Batch"
              isSubmitting={isSubmitting}
              serverError={formError}
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingBatch(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <BatchForm
              title={`Edit — ${editingBatch.name}`}
              defaultValues={{
                name: editingBatch.name,
                academic_year: editingBatch.academic_year,
                description: editingBatch.description ?? undefined,
                batch_code: editingBatch.batch_code ?? undefined,
                course_name: editingBatch.course_name ?? undefined,
                start_date: editingBatch.start_date ?? undefined,
                end_date: editingBatch.end_date ?? undefined,
                capacity: editingBatch.capacity ?? undefined,
              }}
              isSubmitting={isSubmitting}
              serverError={formError}
              onSubmit={handleEdit}
              onCancel={() => setEditingBatch(null)}
            />
          </div>
        </div>
      )}

      {/* Assign Students Panel */}
      {assignBatch && instituteId && (
        <AssignStudentsPanel
          batch={assignBatch}
          instituteId={instituteId}
          onClose={() => setAssignBatch(null)}
          onSuccess={handleAssignSuccess}
        />
      )}
    </ProtectedRoute>
  );
}
