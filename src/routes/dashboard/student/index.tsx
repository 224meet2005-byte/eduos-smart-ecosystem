import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AttendanceCalendar } from "@/components/dashboard/student/AttendanceCalendar";
import { AttendanceChart } from "@/components/dashboard/student/AttendanceChart";
import { AttendanceHistoryTable } from "@/components/dashboard/student/AttendanceHistoryTable";
import { AttendanceStatsCard } from "@/components/dashboard/student/AttendanceStatsCard";
import { BatchInfoCard } from "@/components/dashboard/student/BatchInfoCard";
import { StudentProfileCard } from "@/components/dashboard/student/StudentProfileCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentStudentDashboard } from "@/services/student.service";
import { getStudentFees } from "@/services/billing.service";
import { useAuthStore } from "@/store/authStore";
import { useStudentDashboardStore } from "@/store/studentDashboardStore";
import type { AttendanceStatus, StudentAttendanceRecord, StudentFee } from "@/types";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { FeeStatusBadge } from "@/modules/fees/components/FeeStatusBadge";

export const Route = createFileRoute("/dashboard/student/")({
  head: () => ({ meta: [{ title: "Student Dashboard — EduOS" }] }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const { user } = useAuthStore();
  const dashboard = useStudentDashboardStore((state) => state.dashboard);
  const cachedStudentId = useStudentDashboardStore((state) => state.studentId);
  const isLoading = useStudentDashboardStore((state) => state.isLoading);
  const error = useStudentDashboardStore((state) => state.error);
  const lastUpdated = useStudentDashboardStore((state) => state.lastUpdated);
  const setLoading = useStudentDashboardStore((state) => state.setLoading);
  const setError = useStudentDashboardStore((state) => state.setError);
  const setDashboard = useStudentDashboardStore((state) => state.setDashboard);

  const [warning, setWarning] = useState<string | null>(null);
  const [feeWarning, setFeeWarning] = useState<string | null>(null);
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [sortDirection, setSortDirection] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (!user.institute_id) {
      setError("Student session is missing the linked institute.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setWarning(null);
      setFeeWarning(null);

      const response = await getCurrentStudentDashboard(user.id, user.institute_id);
      if (cancelled) return;

      if (response.success && response.data) {
        setDashboard(user.id, response.data);
        setWarning(response.error);
        setError(null);
      } else {
        setError(response.error ?? "Failed to load the student dashboard.");
      }

      if (response.success && response.data?.student?.id) {
        const feeResult = await getStudentFees(response.data.student.id);
        if (!cancelled && feeResult.success && feeResult.data) {
          setStudentFees(feeResult.data);
        } else if (!cancelled) {
          setFeeWarning(feeResult.error ?? "Failed to load fee data.");
          setStudentFees([]);
        }
      }

      setLoading(false);
    }

    loadDashboard().catch((loadError) => {
      if (cancelled) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load the student dashboard.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [setDashboard, setError, setLoading, user?.id, user?.institute_id]);

  const activeDashboard = dashboard && cachedStudentId === user?.id ? dashboard : null;
  const attendanceRecords = activeDashboard?.history ?? [];

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    const items = attendanceRecords.filter((record) => {
      const sessionDate = record.session?.session_date ?? record.marked_at.slice(0, 10);
      const batchName = record.session?.batch?.name ?? "general";
      const note = record.notes ?? "";

      const matchesSearch =
        !query ||
        sessionDate.includes(query) ||
        record.status.includes(query) ||
        batchName.toLowerCase().includes(query) ||
        note.toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || record.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    const sorted = [...items].sort((a, b) => {
      const left = new Date(a.session?.session_date ?? a.marked_at).getTime();
      const right = new Date(b.session?.session_date ?? b.marked_at).getTime();
      return sortDirection === "newest" ? right - left : left - right;
    });

    return sorted;
  }, [attendanceRecords, search, sortDirection, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page]);

  const refresh = () => {
    if (!user?.id || !user.institute_id) return;

    setLoading(true);
    setWarning(null);
    setFeeWarning(null);
    void getCurrentStudentDashboard(user.id, user.institute_id)
      .then((response) => {
        if (response.success && response.data) {
          setDashboard(user.id, response.data);
          setWarning(response.error);
          setError(null);
          return getStudentFees(response.data.student.id).then((feeResult) => {
            if (feeResult.success && feeResult.data) {
              setStudentFees(feeResult.data);
            } else {
              setFeeWarning(feeResult.error ?? "Failed to load fee data.");
              setStudentFees([]);
            }
          });
        } else {
          setError(response.error ?? "Failed to refresh the student dashboard.");
        }
      })
      .finally(() => setLoading(false));
  };

  const attendanceRate = activeDashboard?.stats.percentage ?? 0;
  const studentName = activeDashboard?.student.user?.name ?? user?.name ?? "Student";
  const feeTotals = useMemo(() => {
    const total = studentFees.reduce((sum, fee) => sum + fee.final_amount, 0);
    const paid = studentFees.reduce((sum, fee) => sum + fee.paid_so_far, 0);
    const pending = Math.max(0, total - paid);
    const nextDueDate =
      studentFees
        .map((fee) => fee.next_due_date ?? fee.due_date)
        .filter(Boolean)
        .sort()[0] ?? null;

    return { total, paid, pending, nextDueDate };
  }, [studentFees]);
  const pageLabel = `${page} / ${totalPages}`;

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-background via-muted/40 to-primary/10 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge variant="outline" className="gap-1.5 w-fit">
                <Sparkles className="size-3.5" />
                Student Portal
              </Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Welcome back, {studentName.split(" ")[0]}.
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                  View your profile, batch assignment, attendance trend, and session history in one place.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {warning ? (
                <Badge variant="outline" className="gap-1.5 border-amber-500/30 text-amber-700 dark:text-amber-300">
                  <AlertCircle className="size-3.5" />
                  Partial data loaded
                </Badge>
              ) : null}
              {isLoading ? (
                <Badge variant="secondary">Refreshing</Badge>
              ) : null}
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="mr-2 size-4" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickMetric label="Attendance rate" value={`${attendanceRate}%`} />
            <QuickMetric label="Sessions" value={`${activeDashboard?.stats.total_sessions ?? 0}`} />
            <QuickMetric label="Present" value={`${activeDashboard?.stats.present ?? 0}`} />
            <QuickMetric label="Late" value={`${activeDashboard?.stats.late ?? 0}`} />
          </div>
          {warning ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{warning}</p>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}
          {feeWarning ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{feeWarning}</p>
            </div>
          ) : null}
          {lastUpdated ? (
            <p className="mt-4 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Last synced {new Date(lastUpdated).toLocaleString()}
            </p>
          ) : null}
        </section>

        {!activeDashboard && isLoading ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard className="xl:col-span-2" />
          </div>
        ) : activeDashboard ? (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <StudentProfileCard
                student={activeDashboard.student}
                attendanceRate={attendanceRate}
                lastUpdated={lastUpdated}
              />
              <BatchInfoCard batch={activeDashboard.batch} />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <FeeStatCard label="Total fees" value={`₹${feeTotals.total.toLocaleString("en-IN")}`} />
              <FeeStatCard label="Paid" value={`₹${feeTotals.paid.toLocaleString("en-IN")}`} tone="success" />
              <FeeStatCard label="Pending" value={`₹${feeTotals.pending.toLocaleString("en-IN")}`} tone="warning" />
              <FeeStatCard label="Next due" value={feeTotals.nextDueDate ? new Date(feeTotals.nextDueDate).toLocaleDateString() : "—"} />
            </div>

            <Card className="overflow-hidden rounded-2xl border-border/60 bg-card shadow-sm">
              <CardContent className="p-0">
                <div className="border-b border-border px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Fee & Billing</h2>
                      <p className="text-sm text-muted-foreground">
                        {studentFees.length} active fee record{studentFees.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge variant="outline">Parent linked automatically</Badge>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {studentFees.length === 0 ? (
                    <div className="px-5 py-8 text-sm text-muted-foreground">
                      No fee records found for this student yet.
                    </div>
                  ) : (
                    studentFees.map((fee) => {
                      const remaining = Math.max(0, fee.final_amount - fee.paid_so_far);
                      return (
                        <div key={fee.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">
                                {fee.fee_structure?.fee_name ?? fee.fee_structure?.name ?? "Fee"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Bill {fee.bill_number ?? fee.id.slice(0, 8)} · Due {new Date(fee.next_due_date ?? fee.due_date).toLocaleDateString()}
                              </p>
                            </div>
                            <FeeStatusBadge status={fee.status} />
                          </div>
                          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                            <MiniFeeMetric label="Total" value={`₹${fee.final_amount.toLocaleString("en-IN")}`} />
                            <MiniFeeMetric label="Paid" value={`₹${fee.paid_so_far.toLocaleString("en-IN")}`} />
                            <MiniFeeMetric label="Pending" value={`₹${remaining.toLocaleString("en-IN")}`} />
                            <MiniFeeMetric label="Parent" value={fee.parent?.user?.name ?? "Linked parent"} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <AttendanceStatsCard stats={activeDashboard.stats} />

            <AttendanceChart
              monthlyTrend={activeDashboard.stats.monthly_trend}
              weeklyTrend={activeDashboard.stats.weekly_trend}
            />

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <AttendanceHistoryTable
                records={paginatedRecords}
                total={filteredRecords.length}
                page={page}
                pageSize={pageSize}
                search={search}
                statusFilter={statusFilter}
                sortDirection={sortDirection}
                onSearchChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                onStatusChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                onSortChange={(value) => {
                  setSortDirection(value);
                  setPage(1);
                }}
                onPageChange={setPage}
              />
              <AttendanceCalendar records={attendanceRecords} />
            </div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Page {pageLabel}</p>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}

function QuickMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/50 bg-background/70">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function LoadingCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );
}

function FeeStatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: "bg-muted/40 text-foreground",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };

  return (
    <Card className="border-border/60 bg-card/80 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <p className={`mt-2 text-lg font-semibold ${toneClasses[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniFeeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
