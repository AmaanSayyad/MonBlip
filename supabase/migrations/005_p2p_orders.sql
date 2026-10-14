-- Create the p2p_orders table to track matchable bets for SOL and BNB
-- This allows P2P matching before falling back to Player-to-Treasury (P2T)

CREATE TABLE IF NOT EXISTS p2p_orders (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  network TEXT NOT NULL, -- 'SOL' or 'BNB'
  asset TEXT NOT NULL, -- e.g. 'BTC'
  amount DECIMAL NOT NULL,
  direction TEXT NOT NULL, -- 'UP' or 'DOWN'
  timeframe INTEGER NOT NULL, -- duration in seconds
  multiplier DECIMAL NOT NULL,
  is_matched BOOLEAN DEFAULT FALSE,
  matched_with TEXT, -- reference to another betId or null if P2T
  is_p2t BOOLEAN DEFAULT TRUE,
  tx_hash TEXT, -- On-chain transaction signature for the initial stake
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT 'active' -- 'active', 'won', 'lost', 'cancelled'
);

-- Index for efficient matching
CREATE INDEX IF NOT EXISTS idx_p2p_matching ON p2p_orders (
  network, 
  asset, 
  amount, 
  direction, 
  timeframe, 
  is_matched
) WHERE is_matched = FALSE;

-- Ensure RLS is enabled
ALTER TABLE p2p_orders ENABLE ROW LEVEL SECURITY;

-- Allow read for everyone
CREATE POLICY "p2p_orders_read_all" ON p2p_orders
  FOR SELECT USING (true);

-- Allow system handles for inserts/updates (using service role typically handles this, but including basic policy)
CREATE POLICY "p2p_orders_insert_system" ON p2p_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "p2p_orders_update_system" ON p2p_orders
  FOR UPDATE USING (true);
