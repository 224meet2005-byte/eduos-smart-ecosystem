// ---------------------------------------------------------------------------
// EduOS — Register Institute Service (auth module)
//
// ARCHITECTURE NOTE — Why this uses supabase.rpc() instead of direct inserts
// ---------------------------------------------------------------------------
//
// The original implementation called supabase.auth.signUp() then did manual
// INSERT statements against `institutes` and `users`. This had 4 fatal flaws:
//
//  1. TRIGGER RACE: The on_auth_user_created trigger fires synchronously
//     inside the auth.signUp() transaction BEFORE the institute row exists.
//     institute_id NOT NULL constraint → the entire signUp() rolls back.
//
//  2. DUPLICATE KEY: Even if the trigger survived, the manual users INSERT
//     would collide with the trigger-created row (no ON CONFLICT handling).
//
//  3. RLS BLOCKED: The anon key has no INSERT policy on `institutes` or
//     `users`, so both table writes fail silently or with 403.
//
//  4. NO ATOMICITY: A crash between steps leaves orphaned auth.users rows
//     with no matching profile, causing broken login states forever.
//
// FIX: A single SECURITY DEFINER Postgres function (register_institute)
// handles steps 2–3 atomically inside the DB, bypassing RLS safely.
// The trigger (handle_new_user) now skips when no institute_id is in
// metadata — self-registration always goes through the RPC path.
//
// FLOW:
//   signUp()  →  no trigger action (institute_id absent from metadata)
//             →  supabase.rpc('register_institute', { ...params })
//             →  [DB] validate auth user  →  insert institute
//                                         →  insert user (admin role)
//             →  return { userId, instituteId, requiresEmailConfirmation }
//
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@/types";

// ── Parameter type ───────────────────────────────────────────────────────────

/**
 * Payload for `registerInstitute()`.
 * `confirmPassword` is intentionally absent — strip it in the calling component
 * before passing the rest of the form values here.
 */
export interface RegisterInstituteParams {
  instituteName: string;
  adminName: string;
  email: string;
  phone: string;
  password: string;
}

// ── Response type ────────────────────────────────────────────────────────────

export interface RegisterInstituteResult {
  userId: string;
  instituteId: string;
  /**
   * `true` when Supabase email confirmation is ENABLED.
   * In this case auth.signUp() returns no session and the user must verify
   * their email before they can log in. The UI should show a "check your
   * inbox" screen instead of redirecting to the dashboard.
   *
   * `false` when email confirmation is disabled — the session is live and
   * the caller may navigate directly to the admin dashboard.
   */
  requiresEmailConfirmation: boolean;
}

// ── RPC response shape (from Postgres register_institute function) ─────────

interface RegisterInstituteRpcResult {
  user_id: string;
  institute_id: string;
  already_exists: boolean;
}

// ── Service function ─────────────────────────────────────────────────────────

/**
 * Registers a new institute and provisions its first admin account.
 *
 * Two-step flow:
 *  1. `supabase.auth.signUp` — creates the Supabase Auth identity.
 *     The on_auth_user_created trigger is intentionally a no-op here
 *     because no institute_id is passed in metadata.
 *  2. `supabase.rpc('register_institute')` — single atomic DB transaction
 *     that validates the auth user, creates the institute row, and creates
 *     the admin profile row. Runs as SECURITY DEFINER, bypasses RLS.
 *
 * Never throws — all errors are returned as structured `ApiResponse` values.
 */
export async function registerInstitute(
  params: RegisterInstituteParams,
): Promise<ApiResponse<RegisterInstituteResult>> {
  const { instituteName, adminName, email, phone, password } = params;

  // ── Guard: Supabase not configured ──────────────────────────────────────────
  // Return a structured error so the form can display a helpful message instead
  // of crashing. After this return, TypeScript narrows `supabase` to SupabaseClient.
  if (!supabase) {
    return {
      data: null,
      error:
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart the dev server.",
      success: false,
    };
  }

  // ── Step 1: Create the Supabase Auth user ──────────────────────────────────
  //
  // IMPORTANT: Do NOT pass institute_id or role in the metadata here.
  // The on_auth_user_created trigger now skips the users INSERT when
  // institute_id is absent, preventing the NOT NULL constraint failure.
  // The RPC (Step 2) is the single source of truth for profile creation.

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        // Only pass display name — NOT institute_id or role.
        // Role assignment is handled by the SECURITY DEFINER RPC.
        name: adminName,
      },
    },
  });

  if (authError) {
    return {
      data: null,
      error: authError.message,
      success: false,
    };
  }

  if (!authData.user) {
    return {
      data: null,
      error: "Sign-up succeeded but no user was returned. Please try again.",
      success: false,
    };
  }

  const userId = authData.user.id;

  // Detect whether email confirmation is required.
  // When enabled, signUp() returns `session: null` — the user must verify
  // their email before their JWT is issued.
  const requiresEmailConfirmation = !authData.session;

  // ── Step 2: Atomic institute + profile creation via SECURITY DEFINER RPC ──
  //
  // This single Postgres function call:
  //   a) Validates userId exists in auth.users (created within 10 minutes)
  //   b) Creates the `institutes` row
  //   c) Creates the `users` row with role = 'admin' (hardcoded in DB)
  //   d) Handles duplicate submissions idempotently (page refresh safe)
  // All three DB operations run inside a single transaction — if any fail,
  // all are rolled back. The RLS bypass is safe because the role is DB-assigned.

  const { data: rpcData, error: rpcError } = await supabase.rpc("register_institute", {
    p_institute_name: instituteName,
    p_admin_name: adminName,
    p_email: email,
    p_phone: phone,
    p_user_id: userId,
  });

  if (rpcError) {
    // Map known DB-level exception prefixes to user-friendly messages
    const message = mapRpcError(rpcError.message);
    return {
      data: null,
      error: message,
      success: false,
    };
  }

  if (!rpcData) {
    return {
      data: null,
      error: "Registration completed but no confirmation was returned. Please contact support.",
      success: false,
    };
  }

  const result = rpcData as RegisterInstituteRpcResult;

  return {
    data: {
      userId: result.user_id,
      instituteId: result.institute_id,
      requiresEmailConfirmation,
    },
    error: null,
    success: true,
  };
}

// ── Error message mapping ────────────────────────────────────────────────────

/**
 * Maps PostgreSQL RAISE EXCEPTION messages from register_institute()
 * to user-friendly strings. Falls back to the raw message for unknown errors.
 */
function mapRpcError(raw: string): string {
  if (raw.includes("REGISTRATION_INVALID_USER")) {
    return "Registration session is invalid. Please refresh the page and try again.";
  }
  if (raw.includes("REGISTRATION_SESSION_EXPIRED")) {
    return "Your registration window has expired. Please start again.";
  }
  if (raw.includes("duplicate key") && raw.includes("users_email_key")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (raw.includes("duplicate key") && raw.includes("institutes")) {
    return "An institute with this name may already exist. Please contact support.";
  }
  // Return the raw Supabase/Postgres message for unexpected errors
  return raw;
}
