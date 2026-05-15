// ---------------------------------------------------------------------------
// useAuth — primary auth hook consumed by any component that needs the
// current user, their institute context, loading state, or role helpers.
//
// This hook is intentionally thin: all mutable state lives in authStore.
// useAuth just re-exports it with a clean public API and wires up the
// Supabase auth listener on first mount (in the component tree that calls
// it — typically AuthProvider).
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/services/auth.service";

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    // ── 1. Hydrate from whatever session already exists in localStorage ──
    async function init() {
      store.setLoading(true);
      const result = await getCurrentUser();
      if (result.success && result.data) {
        store.login(result.data.user, result.data.institute);
      } else {
        store.logout();
      }
    }

    init();

    // ── 2. Keep the store in sync with every subsequent auth event ──────
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_OUT" || !session) {
          store.logout();
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          const result = await getCurrentUser();
          if (result.success && result.data) {
            store.login(result.data.user, result.data.institute);
          }
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    /** The currently authenticated `User` row, or `null`. */
    user: store.user,
    /** The institute the user belongs to, or `null`. */
    institute: store.institute,
    /** `true` once a valid session has been confirmed. */
    isAuthenticated: store.isAuthenticated,
    /** `true` while the initial session check is in flight. */
    isLoading: store.isLoading,
    /** Convenience shortcut — equivalent to `user?.role`. */
    role: store.getRole(),
    /** Convenience shortcut — equivalent to `user?.institute_id`. */
    instituteId: store.getInstituteId(),
  };
}
