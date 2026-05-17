import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { getStaffByUserId, getStaffAssignments, getStaffBatchAssignments } from "@/services/staff.service";
import { getTeacherStudentCount } from "@/services/teacherStudents.service";
import { getSchedulesByTeacher } from "@/services/schedule.service";
import { SchedulePortalView } from "@/modules/schedule/components/SchedulePortalView";
import { filterSchedulesForToday } from "@/modules/schedule/utils/scheduleHelpers";
import type { Schedule } from "@/types";
import { BookOpen, Users, Calendar, ArrowRight, Loader2, GraduationCap, CheckCircle2 } from "lucide-react";
import type { Staff, StaffAssignment, StaffBatchAssignment } from "@/types";

export const Route = createFileRoute("/dashboard/staff/")({
  head: () => ({ meta: [{ title: "Staff Dashboard — EduOS" }] }),
  component: StaffDashboard,
});

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 shadow-sm">
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

function StaffDashboard() {
  const { user, institute } = useAuthStore();
  const [staffRecord, setStaffRecord] = useState<Staff | null>(null);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [batchAssignments, setBatchAssignments] = useState<StaffBatchAssignment[]>([]);
  const [todaySlots, setTodaySlots] = useState<Schedule[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  useEffect(() => {
    async function loadDashboardData() {
      if (!user?.id) return;
      setIsLoading(true);
      
      const staffRes = await getStaffByUserId(user.id);
      if (staffRes.success && staffRes.data) {
        setStaffRecord(staffRes.data);
        const assignRes = await getStaffAssignments(staffRes.data.id);
        if (assignRes.success && assignRes.data) {
          setAssignments(assignRes.data.filter((a) => Boolean(a.course_name || a.subject_name)));
        }
        const batchAssignRes = await getStaffBatchAssignments(staffRes.data.id);
        if (batchAssignRes.success && batchAssignRes.data) {
          setBatchAssignments(batchAssignRes.data);
        }
        const schedRes = await getSchedulesByTeacher(staffRes.data.id);
        if (schedRes.success && schedRes.data) {
          setTodaySlots(filterSchedulesForToday(schedRes.data));
        }
        const countRes = await getTeacherStudentCount(staffRes.data.id);
        if (countRes.success && countRes.data !== null) {
          setStudentCount(countRes.data);
        }
      }
      setIsLoading(false);
    }
    loadDashboardData();
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Staff Portal • {staffRecord?.designation ?? "Faculty"}
          </p>
        </div>
        <h1 className="text-3xl font-bold text-foreground">Welcome back, {firstName}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {institute?.name} • {staffRecord?.department} Department
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <StatCard
          label="Assigned Batches"
          value={batchAssignments.length}
          icon={<BookOpen className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-950"
        />
        <StatCard
          label="Total Students"
          value={studentCount ?? "—"}
          icon={<Users className="h-5 w-5 text-purple-600" />}
          color="bg-purple-50 dark:bg-purple-950"
        />
        <StatCard
          label="Attendance Today"
          value="—"
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          color="bg-green-50 dark:bg-green-950"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assigned Batches List */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              My Assignments
            </h2>
          </div>
          <div className="p-0">
            {assignments.length > 0 ? (
              <ul className="divide-y divide-border">
                {assignments.map((a) => (
                  <li key={a.id} className="group hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between px-6 py-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {a.subject_name || "General"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          {a.batch?.name} • {a.course_name}
                        </p>
                      </div>
                      <Link
                        to="/dashboard/admin/attendance" // Pointing to existing attendance for now
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">No classes assigned to you yet.</p>
              </div>
            )}

            {batchAssignments.length > 0 && (
              <div className="border-t border-border px-6 py-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned batches
                </p>
                <div className="flex flex-wrap gap-2">
                  {batchAssignments.map((assignment) => (
                    <span
                      key={assignment.id}
                      className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground"
                    >
                      {assignment.batch?.name ?? "Unknown batch"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions / Schedule */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/dashboard/admin/attendance"
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 p-4 transition-all hover:bg-primary/10 hover:border-primary/30 group"
              >
                <div className="rounded-lg bg-background p-2 shadow-sm group-hover:bg-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-foreground">Mark Attendance</span>
              </Link>
              <Link
                to="/dashboard/staff/students"
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 p-4 transition-all hover:bg-primary/10 hover:border-primary/30 group"
              >
                <div className="rounded-lg bg-background p-2 shadow-sm group-hover:bg-primary/20">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-foreground">View Students</span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Today's Schedule</h2>
            {todaySlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No classes scheduled for today.</p>
            ) : (
              <ul className="space-y-2">
                {todaySlots.map((slot) => (
                  <li key={slot.id} className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">
                      {slot.subject?.name ?? slot.title ?? "Session"}
                    </p>
                    <p className="text-muted-foreground">
                      {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                      {slot.batch?.name ? ` · ${slot.batch.name}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {staffRecord && (
        <div className="mt-8">
          <SchedulePortalView
            title="My teaching timetable"
            subtitle="Published sessions across your assigned batches"
            loadSchedules={() => getSchedulesByTeacher(staffRecord.id)}
          />
        </div>
      )}
    </ProtectedRoute>
  );
}
