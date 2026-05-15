import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { Building2, GraduationCap, UserCheck, Users } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — EduOS" }] }),
  component: AdminDashboard,
});

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { user, institute } = useAuthStore();

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Admin Panel
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Welcome, {user?.name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{institute?.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Students"
          value="—"
          icon={<GraduationCap className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-950"
        />
        <StatCard
          label="Staff Members"
          value="—"
          icon={<UserCheck className="h-5 w-5 text-green-600" />}
          color="bg-green-50 dark:bg-green-950"
        />
        <StatCard
          label="Parents"
          value="—"
          icon={<Users className="h-5 w-5 text-purple-600" />}
          color="bg-purple-50 dark:bg-purple-950"
        />
        <StatCard
          label="Institute"
          value={institute?.subscription_plan?.toUpperCase() ?? "—"}
          icon={<Building2 className="h-5 w-5 text-orange-600" />}
          color="bg-orange-50 dark:bg-orange-950"
        />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <p className="text-sm text-muted-foreground">
          More modules coming soon — attendance, fees, LMS, analytics.
        </p>
      </div>
    </ProtectedRoute>
  );
}
