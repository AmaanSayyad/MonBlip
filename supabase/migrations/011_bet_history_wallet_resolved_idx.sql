-- Profile asks for the latest 10 rounds for one wallet.
-- The wallet index finds every row, then sorts them. A busy wallet has thousands of rounds.
CREATE INDEX IF NOT EXISTS idx_bh_wallet_resolved
  ON public.bet_history (wallet_address, resolved_at DESC);
