import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { StudentDashboardData } from "@/types";

export interface StudentDashboardState {
  dashboard: StudentDashboardData | null;
  studentId: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setDashboard: (studentId: string, dashboard: StudentDashboardData) => void;
  resetDashboard: () => void;
}

export const useStudentDashboardStore = create<StudentDashboardState>()(
  devtools(
    persist(
      (set) => ({
        dashboard: null,
        studentId: null,
        isLoading: true,
        error: null,
        lastUpdated: null,
        setLoading: (isLoading) => set({ isLoading }, false, "studentDashboard/setLoading"),
        setError: (error) => set({ error }, false, "studentDashboard/setError"),
        setDashboard: (studentId, dashboard) =>
          set(
            {
              dashboard,
              studentId,
              isLoading: false,
              error: null,
              lastUpdated: new Date().toISOString(),
            },
            false,
            "studentDashboard/setDashboard",
          ),
        resetDashboard: () =>
          set(
            {
              dashboard: null,
              studentId: null,
              isLoading: true,
              error: null,
              lastUpdated: null,
            },
            false,
            "studentDashboard/resetDashboard",
          ),
      }),
      {
        name: "eduos-student-dashboard",
        partialize: (state) => ({
          dashboard: state.dashboard,
          studentId: state.studentId,
          lastUpdated: state.lastUpdated,
        }),
      },
    ),
    { name: "EduOS Student Dashboard Store" },
  ),
);
