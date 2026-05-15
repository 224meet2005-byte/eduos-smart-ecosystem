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

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";
import { LinkedStudentCards } from "@/modules/parents/components/LinkedStudentCards";
import { getParentByUserId } from "@/services/parent.service";
import { getStudentsByParentId } from "@/services/student.service";
import type { Student } from "@/types";

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
  const [isLoading, setIsLoading] = useState(true);

  // ── Fetch parent profile + linked students ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      // Step 1: resolve the parent row from the auth user id.
      const parentResult = await getParentByUserId(user!.id);

      if (cancelled) return;

      if (parentResult.success && parentResult.data) {
        // Step 2: fetch all students linked to this parent.
        const studentsResult = await getStudentsByParentId(parentResult.data.id);

        if (!cancelled && studentsResult.success && studentsResult.data) {
          setStudents(studentsResult.data);
        }
      }

      if (!cancelled) setIsLoading(false);
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
      />

      <div className="mt-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">My Children</h2>
        <LinkedStudentCards students={students} isLoading={isLoading} />
      </div>
    </ProtectedRoute>
  );
}
