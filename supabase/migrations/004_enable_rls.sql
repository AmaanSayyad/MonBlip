-- 004_enable_rls.sql
-- Enable Row Level Security on every table and deny all access from the
-- public anon key. The Next.js backend uses the service role key which
-- bypasses RLS, so no backend functionality is affected.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste and run this entire file.
--
-- ROOT CAUSE BEING FIXED:
--   The Supabase anon key is embedded in the frontend bundle
--   (NEXT_PUBLIC_SUPABASE_ANON_KEY). Without RLS any browser can call
--   https://<project>.supabase.co/rest/v1/<table>?select=* and read or
--   write any row. Enabling RLS with no permissive policies makes every
--   table deny-by-default for the anon role.

-- ── 1. Enable RLS on all tables ──────────────────────────────────────────────

ALTER TABLE public.user_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_referrals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_wallets        ENABLE ROW LEVEL SECURITY;

-- user_sessions may not exist yet (created by 003 migration)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_sessions') THEN
    EXECUTE 'ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ── 2. Drop any existing permissive anon policies ────────────────────────────
-- (safe to run even if they don't exist)

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 3. Deny all direct anon/authenticated access ─────────────────────────────
-- No SELECT / INSERT / UPDATE / DELETE policies are created for anon or
-- authenticated roles. With RLS enabled and no permissive policies, Postgres
-- implicitly denies all operations.
--
-- The service role key (used by Next.js API routes) is exempt from RLS
-- so all backend operations continue to work.

-- ── 4. Fix the manipulated referral count ────────────────────────────────────
-- Reset the attacker's fraudulent referral_count back to 0.
UPDATE public.user_referrals
SET    referral_count = 0
WHERE  LOWER(user_address) = LOWER('0xDD13526321f811db6103F3C9CF25A04F07B91973');

-- ── 5. Revoke direct table privileges from anon and public roles ──────────────
-- Belt-and-suspenders: even if RLS is somehow bypassed, the role has no
-- SQL-level privilege to touch these tables.

REVOKE ALL ON public.user_balances       FROM anon, authenticated;
REVOKE ALL ON public.balance_audit_log   FROM anon, authenticated;
REVOKE ALL ON public.withdrawal_requests FROM anon, authenticated;
REVOKE ALL ON public.bet_history         FROM anon, authenticated;
REVOKE ALL ON public.user_profiles       FROM anon, authenticated;
REVOKE ALL ON public.user_referrals      FROM anon, authenticated;
REVOKE ALL ON public.access_codes        FROM anon, authenticated;
REVOKE ALL ON public.waitlist            FROM anon, authenticated;
REVOKE ALL ON public.banned_wallets      FROM anon, authenticated;
