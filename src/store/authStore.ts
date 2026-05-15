import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";
import type { User, Institute, UserRole } from "@/types";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface AuthState {
  // ── Data ──────────────────────────────────────────────────────────────────
  user: User | null;
  institute: Institute | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // ── Primitive setters ─────────────────────────────────────────────────────
  setUser: (user: User | null) => void;
  setInstitute: (institute: Institute | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthenticated: (auth: boolean) => void;

  // ── Compound actions ──────────────────────────────────────────────────────
  /** Called after a successful Supabase sign-in */
  login: (user: User, institute: Institute) => void;
  /** Called on sign-out — wipes all auth state */
  logout: () => void;

  // ── Derived selectors (stable references, avoids inline selectors) ─────────
  getRole: () => UserRole | null;
  getInstituteId: () => string | null;
}

// ---------------------------------------------------------------------------
// Store
// Stack: devtools (outermost) → persist → vanilla create
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        // ── Initial state ───────────────────────────────────────────────────
        user: null,
        institute: null,
        isAuthenticated: false,
        /** Start as true so UI can show a loading skeleton while we restore session */
        isLoading: true,

        // ── Setters ─────────────────────────────────────────────────────────
        setUser: (user) => set({ user }, false, "auth/setUser"),
        setInstitute: (institute) => set({ institute }, false, "auth/setInstitute"),
        setLoading: (isLoading) => set({ isLoading }, false, "auth/setLoading"),
        setAuthenticated: (isAuthenticated) =>
          set({ isAuthenticated }, false, "auth/setAuthenticated"),

        // ── Compound actions ─────────────────────────────────────────────────
        login: (user, institute) =>
          set({ user, institute, isAuthenticated: true, isLoading: false }, false, "auth/login"),

        logout: () =>
          set(
            { user: null, institute: null, isAuthenticated: false, isLoading: false },
            false,
            "auth/logout",
          ),

        // ── Selectors ────────────────────────────────────────────────────────
        getRole: () => get().user?.role ?? null,
        getInstituteId: () => get().user?.institute_id ?? null,
      }),
      {
        name: "eduos-auth", // localStorage key
        /**
         * Only persist the minimal set of fields needed to restore UI state.
         * Sensitive derived values are re-fetched from Supabase on app mount.
         */
        partialize: (state) => ({
          user: state.user,
          institute: state.institute,
          isAuthenticated: state.isAuthenticated,
        }),
      },
    ),
    { name: "EduOS Auth Store" },
  ),
);
