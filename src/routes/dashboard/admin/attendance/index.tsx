// ---------------------------------------------------------------------------
// EduOS — Admin: Attendance Management Page
//
// Full attendance management interface for institute admins and staff.
//
// Features:
//  - "Sessions" tab — browse sessions by date + batch; inline attendance
//    marking table that expands below each session card on click.
//  - "Reports" tab  — batch-scoped, date-range report showing per-student
//    AttendanceSummaryCards, sorted by lowest attendance first.
//  - "New Session" modal (CreateSessionModal) for creating sessions.
//  - Lock session button on each session card to freeze editing.
//
// STATE / DATA FLOW
//   All data is fetched imperatively with useEffect and useState — no
//   external query library.  All requests are scoped to `user.institute_id`.
//
// PARENT LAYOUT
//   DashboardLayout is injected by the parent route — this component renders
//   only its own content, not the shell.
// ---------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Calendar,
  Lock,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ClipboardList,
  Loader2,
} from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";
import { formatDate } from "@/utils/helpers";
import { toast } from "sonner";
import { searchStudents } from "@/services/student.service";
import { getActiveAttendanceBatches } from "@/services/batch.service";
import {
  getAttendanceSessions,
  getSessionWithRecords,
  bulkMarkAttendance,
  lockAttendanceSession,
  getAttendanceSummary,
} from "@/services/attendance.service";
import { CreateSessionModal } from "@/modules/attendance/components/CreateSessionModal";
import { AttendanceMarkingTable } from "@/modules/attendance/components/AttendanceMarkingTable";
import { AttendanceSummaryCard } from "@/modules/attendance/components/AttendanceSummaryCard";
import type {
  AttendanceSession,
  AttendanceRecord,
  AttendanceSummary,
  AttendanceBatchOption,
  Student,
  BulkAttendanceEntry,
} from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/attendance/")({
  head: () => ({ meta: [{ title: "Attendance — EduOS" }] }),
  component: AttendancePage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return today as YYYY-MM-DD — safe for <input type="date">. */
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/** Return the first day of the current calendar month as YYYY-MM-DD. */
function firstOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split("T")[0];
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Tab = "sessions" | "reports";

interface TabButtonProps {
  id: Tab;
  active: Tab;
  icon: React.ReactNode;
  label: string;
  onClick: (t: Tab) => void;
}

function TabButton({ id, active, icon, label, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      onClick={() => onClick(id)}
      className={`inline-flex items-center gap-2 border-b-2 px-1 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active === id
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Session card shown in the Sessions tab list. */
interface SessionCardProps {
  session: AttendanceSession;
  isExpanded: boolean;
  isLocking: boolean;
  onExpand: () => void;
  onLock: () => void;
}

function SessionCard({ session, isExpanded, isLocking, onExpand, onLock }: SessionCardProps) {
  return (
    <div
      className={`rounded-xl border bg-card transition-shadow hover:shadow-sm ${
        session.is_locked ? "border-amber-200 dark:border-amber-800" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        {/* Left — session info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {session.batch?.name ?? "No batch"}
            </span>
            {/* Session type pill */}
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {session.session_type}
            </span>
            {/* Locked indicator */}
            {session.is_locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                Locked
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(session.session_date)}
            {session.topic ? ` · ${session.topic}` : ""}
            {session.conductor ? ` · by ${session.conductor.name}` : ""}
          </p>
        </div>

        {/* Right — action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Lock / Unlock button */}
          {!session.is_locked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLock();
              }}
              disabled={isLocking}
              title="Lock session (no more edits after locking)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 dark:hover:bg-amber-950 dark:hover:text-amber-400"
            >
              {isLocking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Lock
            </button>
          )}

          {/* Mark Attendance toggle */}
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                Close
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                Mark Attendance
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

function AttendancePage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  // ── Shared state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("sessions");
  const [batches, setBatches] = useState<AttendanceBatchOption[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // ── Sessions tab state ───────────────────────────────────────────────────
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  /** Date filter for sessions list. */
  const [selectedDate, setSelectedDate] = useState(todayIso());
  /** Batch filter for sessions list (empty string = all batches). */
  const [sessionBatchFilter, setSessionBatchFilter] = useState("");

  // ── Expanded session (inline AttendanceMarkingTable) ─────────────────────
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Student[]>([]);
  const [expandedRecords, setExpandedRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Tracks which session is currently being locked (to show a spinner). */
  const [lockingSessionId, setLockingSessionId] = useState<string | null>(null);

  // ── Reports tab state ────────────────────────────────────────────────────
  const [reportBatchId, setReportBatchId] = useState("");
  const [reportDateFrom, setReportDateFrom] = useState(firstOfMonthIso());
  const [reportDateTo, setReportDateTo] = useState(todayIso());
  const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);

  // ── Fetch batches on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!instituteId) return;

    setIsLoadingBatches(true);

    getActiveAttendanceBatches(instituteId).then((result) => {
      if (result.success && result.data) {
        setBatches(result.data);
      }
      setIsLoadingBatches(false);
    });
  }, [instituteId]);

  // ── Fetch sessions whenever date or batch filter changes ─────────────────
  const fetchSessions = useCallback(async () => {
    if (!instituteId) return;

    setIsLoadingSessions(true);
    setSessionsError(null);

    const result = await getAttendanceSessions(instituteId, {
      dateFrom: selectedDate,
      dateTo: selectedDate,
      batchId: sessionBatchFilter || undefined,
    });

    if (result.success && result.data) {
      setSessions(result.data);
    } else {
      setSessionsError(result.error ?? "Failed to load sessions.");
    }

    setIsLoadingSessions(false);
  }, [instituteId, selectedDate, sessionBatchFilter]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Fetch students + records when a session is expanded ──────────────────
  useEffect(() => {
    if (!expandedSessionId) {
      setExpandedStudents([]);
      setExpandedRecords([]);
      return;
    }

    const session = sessions.find((s) => s.id === expandedSessionId);
    if (!session) return;

    setIsLoadingExpanded(true);
    setSaveError(null);

    Promise.all([
      // Fetch students in this batch (pageSize=1000 to get all)
      session.batch_id
        ? searchStudents(instituteId, { batchId: session.batch_id }, 1, 1000)
        : Promise.resolve({ success: true, data: { items: [] }, error: null }),
      // Fetch existing attendance records for this session
      getSessionWithRecords(expandedSessionId),
    ]).then(([studentsResult, sessionResult]) => {
      if (studentsResult.success && studentsResult.data) {
        setExpandedStudents(studentsResult.data.items);
      }

      if (sessionResult.success && sessionResult.data) {
        setExpandedRecords(sessionResult.data.records);
      }

      setIsLoadingExpanded(false);
    });
  }, [expandedSessionId, sessions, instituteId]);

  // ── Fetch report summaries ────────────────────────────────────────────────
  useEffect(() => {
    if (!reportBatchId || !instituteId) {
      setSummaries([]);
      return;
    }

    setIsLoadingSummaries(true);
    setSummariesError(null);

    getAttendanceSummary(instituteId, reportBatchId, reportDateFrom, reportDateTo).then(
      (result) => {
        if (result.success && result.data) {
          setSummaries(result.data);
        } else {
          setSummariesError(result.error ?? "Failed to load report.");
          setSummaries([]);
        }
        setIsLoadingSummaries(false);
      },
    );
  }, [instituteId, reportBatchId, reportDateFrom, reportDateTo]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleExpandSession(sessionId: string) {
    setExpandedSessionId((prev) => (prev === sessionId ? null : sessionId));
  }

  async function handleLockSession(sessionId: string) {
    setLockingSessionId(sessionId);

    const result = await lockAttendanceSession(sessionId);

    if (result.success && result.data) {
      // Update the session in local state without a full refetch.
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, is_locked: true } : s)));
    }

    setLockingSessionId(null);
  }

  async function handleSaveAttendance(records: BulkAttendanceEntry[]): Promise<boolean> {
    if (!expandedSessionId || !user?.id) return false;

    setIsSaving(true);
    setSaveError(null);

    const debugRows = records.map((record) => ({
      student_id: record.student_id,
      selected_status: record.status,
      notes: record.notes ?? null,
    }));

    console.debug("[attendance.save] payload", {
      session_id: expandedSessionId,
      attendance_date: sessions.find((session) => session.id === expandedSessionId)?.session_date ?? null,
      payload: debugRows,
    });

    const result = await bulkMarkAttendance(expandedSessionId, instituteId, user.id, records);

    if (!result.success) {
      setSaveError(result.error ?? "Failed to save attendance.");
      toast.error(result.error ?? "Failed to save attendance.");
      setIsSaving(false);
      return false;
    } else {
      console.debug("[attendance.save] updated rows", result.data?.records ?? []);
      const refreshed = await getSessionWithRecords(expandedSessionId);
      if (refreshed.success && refreshed.data) {
        setExpandedRecords(refreshed.data.records);
        console.debug("[attendance.save] refetched rows", refreshed.data.records.map((row) => ({
          student_id: row.student_id,
          attendance_date: refreshed.data?.session_date ?? null,
          selected_status: row.status,
        })));
        toast.success("Attendance saved successfully.");
      } else {
        const refreshError = refreshed.error ?? "Saved, but failed to refresh attendance.";
        setSaveError(refreshError);
        toast.error(refreshError);
        setIsSaving(false);
        return false;
      }
      await fetchSessions();
    }

    setIsSaving(false);
    return true;
  }

  function handleSessionCreated(session: AttendanceSession) {
    setIsCreateModalOpen(false);
    // Refresh the sessions list and auto-expand the newly created session.
    fetchSessions().then(() => {
      setExpandedSessionId(session.id);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <PageHeader
        title="Attendance"
        subtitle="Session management and tracking"
        badge={formatDate(todayIso())}
        actions={
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Session
          </button>
        }
      />

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div
        className="mt-5 flex gap-6 border-b border-border"
        role="tablist"
        aria-label="Attendance sections"
      >
        <TabButton
          id="sessions"
          active={activeTab}
          icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
          label="Sessions"
          onClick={setActiveTab}
        />
        <TabButton
          id="reports"
          active={activeTab}
          icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          label="Reports"
          onClick={setActiveTab}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SESSIONS TAB
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "sessions" && (
        <div className="mt-5">
          {/* ── Filter row ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Date picker */}
            <div className="relative flex items-center">
              <Calendar
                className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setExpandedSessionId(null);
                }}
                className="rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Filter by date"
              />
            </div>

            {/* Batch selector */}
            <select
              value={sessionBatchFilter}
              onChange={(e) => {
                setSessionBatchFilter(e.target.value);
                setExpandedSessionId(null);
              }}
              disabled={isLoadingBatches}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              aria-label="Filter by batch"
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {!isLoadingBatches && batches.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-card p-5">
              <p className="text-sm font-medium text-foreground">
                No batches found. Create a batch first.
              </p>
              <Link
                to="/dashboard/admin/batches"
                className="mt-3 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Create Batch
              </Link>
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────── */}
          {sessionsError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{sessionsError}</span>
            </div>
          )}

          {/* ── Loading ──────────────────────────────────────────────── */}
          {isLoadingSessions && (
            <div className="mt-6 flex items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="text-sm">Loading sessions…</span>
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────────── */}
          {!isLoadingSessions && !sessionsError && sessions.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <Calendar
                className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-foreground">
                No sessions on {formatDate(selectedDate)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click "New Session" to create one for this date.
              </p>
            </div>
          )}

          {/* ── Session cards ────────────────────────────────────────── */}
          {!isLoadingSessions && sessions.length > 0 && (
            <div className="mt-4 space-y-3">
              {sessions.map((session) => {
                const isExpanded = expandedSessionId === session.id;

                return (
                  <div key={session.id}>
                    <SessionCard
                      session={session}
                      isExpanded={isExpanded}
                      isLocking={lockingSessionId === session.id}
                      onExpand={() => handleExpandSession(session.id)}
                      onLock={() => handleLockSession(session.id)}
                    />

                    {/* Inline AttendanceMarkingTable */}
                    {isExpanded && (
                      <>
                        {saveError && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{saveError}</span>
                          </div>
                        )}

                        <AttendanceMarkingTable
                          session={session}
                          students={expandedStudents}
                          existingRecords={expandedRecords}
                          isLoading={isLoadingExpanded}
                          onSave={handleSaveAttendance}
                          isSaving={isSaving}
                          isLocked={session.is_locked}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          REPORTS TAB
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "reports" && (
        <div className="mt-5">
          {/* ── Filter controls ──────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            {/* Batch selector */}
            <select
              value={reportBatchId}
              onChange={(e) => setReportBatchId(e.target.value)}
              disabled={isLoadingBatches}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              aria-label="Select batch for report"
            >
              <option value="">— Select a batch —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>

            {/* Date range — from */}
            <div className="relative flex items-center">
              <Calendar
                className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="date"
                value={reportDateFrom}
                onChange={(e) => setReportDateFrom(e.target.value)}
                className="rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Report from date"
              />
            </div>

            <span className="text-xs text-muted-foreground">to</span>

            {/* Date range — to */}
            <div className="relative flex items-center">
              <Calendar
                className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="date"
                value={reportDateTo}
                onChange={(e) => setReportDateTo(e.target.value)}
                className="rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Report to date"
              />
            </div>
          </div>

          {/* ── Error ───────────────────────────────────────────────── */}
          {summariesError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{summariesError}</span>
            </div>
          )}

          {/* ── Prompt to select a batch ─────────────────────────────── */}
          {!reportBatchId && (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <Users
                className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-foreground">
                Select a batch to view attendance reports
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Then adjust the date range above to narrow results.
              </p>
            </div>
          )}

          {/* ── Loading ──────────────────────────────────────────────── */}
          {reportBatchId && isLoadingSummaries && (
            <div className="mt-6 flex items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="text-sm">Generating report…</span>
            </div>
          )}

          {/* ── No data ──────────────────────────────────────────────── */}
          {reportBatchId && !isLoadingSummaries && summaries.length === 0 && !summariesError && (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <BarChart3
                className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-foreground">
                No attendance data for this period
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create sessions and mark attendance to see reports here.
              </p>
            </div>
          )}

          {/* ── Report header + low-attendance count ─────────────────── */}
          {reportBatchId && !isLoadingSummaries && summaries.length > 0 && (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{summaries.length}</span>{" "}
                  student{summaries.length !== 1 ? "s" : ""}
                </p>
                {summaries.filter((s) => s.percentage < 75).length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    {summaries.filter((s) => s.percentage < 75).length} low attendance
                  </span>
                )}
              </div>

              {/* Summary cards grid — lowest attendance first */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {summaries.map((summary) => (
                  <AttendanceSummaryCard
                    key={summary.student_id}
                    summary={summary}
                    showStudentName
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Create Session Modal ──────────────────────────────────────── */}
      <CreateSessionModal
        instituteId={instituteId}
        batches={batches}
        isBatchesLoading={isLoadingBatches}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleSessionCreated}
      />
    </ProtectedRoute>
  );
}
