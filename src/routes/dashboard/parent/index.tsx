// ---------------------------------------------------------------------------
// EduOS — Parent Dashboard
//
// Shows the logged-in parent's linked children using LinkedStudentCards.
// Data flow:
//  1. getParentByUserId(user.id)  → resolves the parent profile and parent.id
//  2. getStudentsByParentId(parentId) → fetches the linked students
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AlertCircle, RefreshCw, Wallet, Users, Clock3, BadgeDollarSign } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/authStore";
import { LinkedStudentCards } from "@/modules/parents/components/LinkedStudentCards";
import { getParentByUserId } from "@/services/parent.service";
import { getStudentsByParentId } from "@/services/student.service";
import { getParentFeeSummary } from "@/services/billing.service";
import type { Student, ParentFeeSummary } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/parent/")({
  head: () => ({ meta: [{ title: "Parent Dashboard — EduOS" }] }),
  component: ParentDashboard,
});

// ── Page component ────────────────────────────────────────────────────────────

function ParentDashboard() {
  const { user } = useAuthStore();

  // ── State ─────────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);
  const [feeSummary, setFeeSummary] = useState<ParentFeeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feeLoading, setFeeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);

  // ── Fetch parent profile + linked students ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setFeeLoading(true);
      setError(null);
      setFeeError(null);

      // Step 1: resolve the parent row from the auth user id.
      const parentResult = await getParentByUserId(user!.id);

      if (cancelled) return;

      if (parentResult.success && parentResult.data) {
        // Step 2: fetch all students linked to this parent.
        const studentsResult = await getStudentsByParentId(parentResult.data.id);
        const feeResult = await getParentFeeSummary(parentResult.data.id);

        if (!cancelled && studentsResult.success && studentsResult.data) {
          setStudents(studentsResult.data);
        }
        if (!cancelled && feeResult.success && feeResult.data) {
          setFeeSummary(feeResult.data);
        } else if (!cancelled) {
          setFeeError(feeResult.error ?? "Failed to load fee summary.");
          setFeeSummary(null);
        }
      }

      if (!cancelled) setIsLoading(false);
      if (!cancelled) setFeeLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["parent"]}>
      <PageHeader
        title={`Hello, ${user?.name?.split(" ")[0] ?? "there"}!`}
        subtitle="Your children's academic overview"
        actions={
          <button
            type="button"
            onClick={() => {
              if (!user) return;
              setIsLoading(true);
              setFeeLoading(true);
              void getParentByUserId(user.id).then(async (parentResult) => {
                if (parentResult.success && parentResult.data) {
                  const [studentsResult, feeResult] = await Promise.all([
                    getStudentsByParentId(parentResult.data.id),
                    getParentFeeSummary(parentResult.data.id),
                  ]);
                  if (studentsResult.success && studentsResult.data) setStudents(studentsResult.data);
                  if (feeResult.success && feeResult.data) setFeeSummary(feeResult.data);
                }
                setIsLoading(false);
                setFeeLoading(false);
              });
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <ParentMetricCard label="Total due" value={feeLoading ? "—" : inr(feeSummary?.total_due ?? 0)} icon={<Wallet className="h-4 w-4" />} />
        <ParentMetricCard label="Paid" value={feeLoading ? "—" : inr(feeSummary?.total_paid ?? 0)} icon={<BadgeDollarSign className="h-4 w-4" />} tone="success" />
        <ParentMetricCard label="Pending" value={feeLoading ? "—" : inr(feeSummary?.remaining_due ?? 0)} icon={<Clock3 className="h-4 w-4" />} tone="warning" />
        <ParentMetricCard label="Children" value={`${students.length}`} icon={<Users className="h-4 w-4" />} />
      </div>

      {feeError ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{feeError}</p>
        </div>
      ) : null}

      {feeSummary ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Fee overview</h2>
              <p className="text-xs text-muted-foreground">Linked fee records grouped by child.</p>
            </div>
            <Badge variant="outline">Auto-linked via student_parents</Badge>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {feeSummary.children.map((child) => (
              <Card key={child.student.id} className="border-border/60 bg-card shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{child.student.user?.name ?? "Child"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{child.student.admission_no}</p>
                    </div>
                    <Badge variant="secondary">{child.fee_items.length} bills</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MiniParentMetric label="Due" value={inr(child.total_due)} />
                    <MiniParentMetric label="Paid" value={inr(child.total_paid)} />
                    <MiniParentMetric label="Pending" value={inr(child.remaining_due)} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {child.fee_items.slice(0, 3).map((item) => (
                      <div key={item.student_fee.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{item.student_fee.fee_structure?.fee_name ?? item.student_fee.fee_structure?.name ?? "Fee"}</p>
                          <p className="text-xs text-muted-foreground">Due {item.next_due_date ? new Date(item.next_due_date).toLocaleDateString() : "—"}</p>
                        </div>
                        <span className="font-semibold text-foreground">{inr(item.remaining_due)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">My Children</h2>
        <LinkedStudentCards students={students} isLoading={isLoading} />
      </div>
    </ProtectedRoute>
  );
}

function ParentMetricCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: "bg-muted/40 text-foreground",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };

  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniParentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
