-- Migration 006: Security hardening
-- Fixes:
--   1. balance_audit_log CHECK constraint: allow 'payout_lock', 'bet_lock', 'platform_fee'
--      so the application-level deduplication locks can actually be inserted.
--   2. Unique constraint on (operation_type, bet_id) for lock rows prevents race-condition
--      double-payout/double-bet even under concurrent requests.
--   3. Unique constraint on transaction_hash for deposit rows prevents deposit replay.
--   4. P2P orders RLS: restrict writes to service role only (reads still public for UI).
--   5. Add signed_at column to withdrawal_requests if missing.

-- ── 1. Expand CHECK on balance_audit_log.operation_type ──────────────────────
ALTER TABLE public.balance_audit_log
  DROP CONSTRAINT IF EXISTS balance_audit_log_operation_type_check;

ALTER TABLE public.balance_audit_log
  ADD CONSTRAINT balance_audit_log_operation_type_check
  CHECK (operation_type IN (
    'deposit',
    'withdrawal',
    'bet_placed',
    'bet_won',
    'payout',
    'reconciliation',
    'payout_lock',
    'bet_lock',
    'platform_fee'
  ));

-- ── 2. Unique index for deduplication locks (bet_id based) ───────────────────
-- Prevents double-payout and double-bet under concurrent requests.
-- Partial index: only lock rows need uniqueness on bet_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_al_lock_bet_id
  ON public.balance_audit_log (operation_type, bet_id)
  WHERE operation_type IN ('payout_lock', 'bet_lock') AND bet_id IS NOT NULL;

-- ── 3. Unique index on transaction_hash for deposits ─────────────────────────
-- Prevents replay of the same on-chain txHash for deposits.
-- Uses a partial index so NULL transaction_hash rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_al_deposit_tx_hash
  ON public.balance_audit_log (transaction_hash)
  WHERE operation_type = 'deposit' AND transaction_hash IS NOT NULL;

-- ── 4. Fix P2P orders RLS ─────────────────────────────────────────────────────
-- Drop overly permissive write policies and replace with service-role-only.
-- Public SELECT is kept for UI display; all writes must use the service role key
-- (server-side only — never exposed to the browser).
-- Wrapped in a DO block so the migration doesn't fail if the table was never created.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'p2p_orders'
  ) THEN
    DROP POLICY IF EXISTS "p2p_orders_insert_system" ON public.p2p_orders;
    DROP POLICY IF EXISTS "p2p_orders_update_system"  ON public.p2p_orders;

    -- Only service role (bypasses RLS by default in Supabase) can write.
    -- Anon/authenticated roles cannot insert or update directly.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'p2p_orders'
        AND policyname = 'p2p_orders_insert_service_only'
    ) THEN
      EXECUTE 'CREATE POLICY "p2p_orders_insert_service_only" ON public.p2p_orders FOR INSERT WITH CHECK (false)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'p2p_orders'
        AND policyname = 'p2p_orders_update_service_only'
    ) THEN
      EXECUTE 'CREATE POLICY "p2p_orders_update_service_only" ON public.p2p_orders FOR UPDATE USING (false)';
    END IF;
  END IF;
END $$;

-- ── 5. Add signed_at column to withdrawal_requests if it doesn't exist ────────
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS signed_at BIGINT;
