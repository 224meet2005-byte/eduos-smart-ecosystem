import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";

export const Route = createFileRoute("/dashboard/staff/")({
  head: () => ({ meta: [{ title: "Staff Dashboard — EduOS" }] }),
  component: StaffDashboard,
});

function StaffDashboard() {
  const { user, institute } = useAuthStore();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Staff Portal
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Welcome, {firstName}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your classes and students</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Attendance, timetable, and gradebook coming soon.
        </p>
      </div>
    </ProtectedRoute>
  );
}
