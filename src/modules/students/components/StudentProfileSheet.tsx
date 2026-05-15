// ---------------------------------------------------------------------------
// EduOS — StudentProfileSheet
//
// A fixed right-side slide-in panel that displays a student's full profile.
// Opens with a backdrop overlay and closes via the X button or backdrop click.
//
// Features:
//  - Avatar with large initials
//  - Info grid: email, phone, batch, joined date
//  - Emergency contact section (rendered only when data is present)
//  - Masked Aadhaar display
//  - Linked parents count (fetched internally when the sheet opens)
//  - Footer: Archive/Restore + Edit actions
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Mail,
  Phone,
  BookOpen,
  Calendar,
  Shield,
  Users,
  AlertTriangle,
  Archive,
  RotateCcw,
  Pencil,
  Loader2,
} from "lucide-react";

import type { Student, StudentParent } from "@/types";
import { getInitials, formatDate } from "@/utils/helpers";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getParentsForStudent } from "@/services";

// ── Props ─────────────────────────────────────────────────────────────────────

interface StudentProfileSheetProps {
  /** The student to display. `null` means the sheet is closed. */
  student: Student | null;
  /** Controls sheet open/close. */
  isOpen: boolean;
  /** Called when the sheet should close. */
  onClose: () => void;
  /** Optional — when provided shows an Edit button in the footer. */
  onEdit?: () => void;
  /** Optional — when provided shows Archive / Restore button in the footer. */
  onArchive?: () => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single labeled info row used in the detail grid. */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground wrap-break-word">{value}</p>
      </div>
    </div>
  );
}

/** A section divider with a label. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-y border-border">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `StudentProfileSheet` — fixed right-side slide-in profile panel.
 *
 * Fetches the student's linked parents internally when the sheet opens,
 * so the parent component only needs to pass the `Student` object.
 *
 * Layout (top → bottom):
 *  - Header (name, admission no, status, close button)
 *  - Avatar
 *  - Info grid (email, phone, batch, joined)
 *  - Aadhaar (if present)
 *  - Emergency contact (if present)
 *  - Linked parents count
 *  - Footer actions (Archive/Restore, Edit)
 */
export function StudentProfileSheet({
  student,
  isOpen,
  onClose,
  onEdit,
  onArchive,
}: StudentProfileSheetProps) {
  const [parents, setParents] = useState<StudentParent[]>([]);
  const [parentsLoading, setParentsLoading] = useState(false);

  // Fetch linked parents whenever the sheet opens for a new student.
  const fetchParents = useCallback(async (studentId: string) => {
    setParentsLoading(true);
    const result = await getParentsForStudent(studentId);
    if (result.success && result.data) {
      setParents(result.data);
    } else {
      setParents([]);
    }
    setParentsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen && student?.id) {
      fetchParents(student.id);
    } else {
      setParents([]);
    }
  }, [isOpen, student?.id, fetchParents]);

  // Trap focus inside sheet and close on Escape key.
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!student) return null;

  const ec = student.emergency_contact;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* ── Slide-in panel ────────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Profile: ${student.user?.name ?? "Student"}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-card border-l border-border shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">
              {student.user?.name ?? "—"}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">{student.admission_no}</p>
            <div className="mt-1.5">
              <StatusBadge status={student.status} size="sm" />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Avatar */}
          <div className="flex justify-center py-7 border-b border-border">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground select-none"
              aria-hidden="true"
            >
              {getInitials(student.user?.name ?? "?")}
            </div>
          </div>

          {/* Info grid */}
          <SectionLabel>Contact & Academic</SectionLabel>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <InfoRow icon={<Mail />} label="Email" value={student.user?.email ?? "—"} />
            <InfoRow icon={<Phone />} label="Phone" value={student.user?.phone ?? "—"} />
            <InfoRow icon={<BookOpen />} label="Batch" value={student.batch_id ?? "—"} />
            <InfoRow icon={<Calendar />} label="Joined" value={formatDate(student.created_at)} />
          </div>

          {/* Aadhaar removed from profile display */}

          {/* Emergency contact — only when present */}
          {ec && (ec.name || ec.phone || ec.relation) && (
            <>
              <SectionLabel>Emergency Contact</SectionLabel>
              <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
                {ec.name && <InfoRow icon={<AlertTriangle />} label="Name" value={ec.name} />}
                {ec.phone && <InfoRow icon={<Phone />} label="Phone" value={ec.phone} />}
                {ec.relation && <InfoRow icon={<Users />} label="Relation" value={ec.relation} />}
              </div>
            </>
          )}

          {/* Linked Parents */}
          <SectionLabel>Linked Parents</SectionLabel>
          <div className="px-5 py-4">
            {parentsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading parents…
              </div>
            ) : parents.length === 0 ? (
              <p className="text-sm text-muted-foreground">None linked</p>
            ) : (
              <div className="space-y-2">
                {parents.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {link.parent?.user?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.parent?.user?.email ?? "—"}
                      </p>
                    </div>
                    <span className="ml-2 shrink-0 text-xs capitalize text-muted-foreground">
                      {link.relation_type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-t border-border px-5 py-4 shrink-0">
          {/* Archive / Restore */}
          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                student.status !== "inactive"
                  ? "border-destructive/30 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40"
                  : "border-border text-foreground hover:bg-muted focus-visible:ring-primary/50"
              }`}
            >
              {student.status !== "inactive" ? (
                <>
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restore
                </>
              )}
            </button>
          )}

          {/* Edit */}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
