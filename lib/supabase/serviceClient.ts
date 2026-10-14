/**
 * Supabase Service (Server-only) Client
 *
 * This client uses the Supabase service role key so server-side routes can read
 * protected/admin tables even when RLS blocks the public anon key.
 */

import { createClient } from '@supabase/supabase-js';

/** Trimmed — stray newlines/spaces in Vercel env values are a common cause of "Invalid API key". */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** True when a non-empty service role key is configured (admin routes should use this in production). */
export const isSupabaseServiceRoleConfigured = Boolean(supabaseServiceKey);

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

const loggedDbFailures = new Set<string>();

/** One line per failure, so a down database does not reprint a stack on every poll. */
export function logDbOnce(label: string, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'request failed';
  const key = `${label}:${message.slice(0, 120)}`;
  if (loggedDbFailures.has(key)) return;
  loggedDbFailures.add(key);
  console.warn(`${label}: ${message}`);
}

export function isDbUnreachable(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.message} ${String(error.cause ?? '')}`
    : JSON.stringify(error);
  return /ENOTFOUND|fetch failed|Failed to fetch|ECONNREFUSED|getaddrinfo|network/i.test(message);
}

if (!supabaseServiceKey) {
  // During local/CI builds, the service role key may not be configured yet.
  // Fallback to anon key so the Next.js build does not fail.
  // NOTE: Admin/server reads may still be blocked by RLS until SUPABASE_SERVICE_KEY is set.
  if (!supabaseAnonKey) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_KEY (and NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }
  logDbOnce('supabase', 'SUPABASE_SERVICE_KEY is unset, so server reads use the anon key');
}

export const supabaseService = createClient(supabaseUrl, supabaseServiceKey || (supabaseAnonKey as string), {
  auth: {
    persistSession: false,
  },
});

/**
 * PostgREST returns "Invalid API key" when the JWT does not match the project or is corrupted.
 * Append operator-facing steps (Vercel + Supabase dashboard).
 */
export function appendSupabaseServiceKeyHint(message: string): string {
  const m = message || '';
  if (!/invalid api key|jwt|malformed|not valid/i.test(m)) return m;
  return `${m} — Fix: Vercel → Project → Settings → Environment Variables: set SUPABASE_SERVICE_KEY to the service_role secret from Supabase → Project Settings → API (same project as NEXT_PUBLIC_SUPABASE_URL). It must be the long JWT starting with "eyJ", not the anon key. Redeploy after saving.`;
}

