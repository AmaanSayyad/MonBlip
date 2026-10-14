-- Chainlink CRE round closes. Serverless instances do not share disk, so the
-- last close lives here. Only the service role writes or reads it.
create table if not exists public.cre_round_closes (
  id bigint generated always as identity primary key,
  bet_id text,
  close jsonb not null,
  posted_at timestamptz not null default now()
);

create index if not exists cre_round_closes_posted_at_idx
  on public.cre_round_closes (posted_at desc);

alter table public.cre_round_closes enable row level security;
