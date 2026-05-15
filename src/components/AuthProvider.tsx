// ---------------------------------------------------------------------------
// AuthProvider — bootstraps auth state before any route component renders.
//
// Responsibilities:
//   1. On mount, restores any existing Supabase session from localStorage
//      and populates the Zustand authStore so every route sees consistent
//      state immediately (no flash of unauthenticated content).
//   2. Subscribes to onAuthStateChange so sign-in / sign-out / token refresh
//      events update the store automatically without a page reload.
//   3. Cleans up the subscription on unmount (SPA teardown / hot-reload).
//
// SUPABASE NULL SAFETY
//   `supabase` is typed as `SupabaseClient | null` (see src/lib/supabase.ts).
//   When env vars are missing the client is null and the entire auth system
//   is non-operational. The effect below detects this early and calls
//   logout() so that:
//     • isLoading is set to false → ProtectedRoute stops spinning.
//     • isAuthenticated stays false → auth pages render normally.
//     • No auth listener is registered → no null-dereference crash.
//
// This component is purely behavioural — it renders children as-is.
// ---------------------------------------------------------------------------

import { useEffect, type ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/services/auth.service";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { login, logout, setLoading } = useAuthStore();

  useEffect(() => {
    // ── Guard: Supabase not configured ──────────────────────────────────────
    // If env vars are absent, `supabase` is null. There is nothing to
    // initialise — immediately mark loading as done so the rest of the UI
    // renders in a "logged out" state without hanging on the spinner.
    if (!supabase) {
      logout(); // sets isLoading = false, isAuthenticated = false
      return;
    }

    // TypeScript narrows `supabase` to `SupabaseClient` for everything below.
    // The module-level const cannot be reassigned, so the narrowing holds
    // inside the nested async function and the onAuthStateChange callback.

    // ── Phase 1: Restore session from localStorage ───────────────────────────
    // Runs once on mount. getCurrentUser() checks the stored JWT and fetches
    // the full user + institute record from the database.
    async function initSession() {
      setLoading(true);
      const result = await getCurrentUser();
      if (result.success && result.data) {
        login(result.data.user, result.data.institute);
      } else {
        // No active session (or session fetch failed) → clear store.
        logout();
      }
    }

    initSession();

    // ── Phase 2: React to live Supabase auth events ──────────────────────────
    // Handles sign-in from another tab, token expiry + silent refresh,
    // and explicit sign-out from any device.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT" || !session) {
        logout();
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const result = await getCurrentUser();
        if (result.success && result.data) {
          login(result.data.user, result.data.institute);
        }
      }
    });

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => subscription.unsubscribe();

    // login/logout/setLoading are stable Zustand actions — intentionally
    // omitted from deps to prevent infinite re-subscription loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
