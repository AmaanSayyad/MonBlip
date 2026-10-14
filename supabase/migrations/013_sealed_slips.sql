-- Mera bet slips sealed under the passkey's slip salt. Ciphertext only: the
-- key is the PRF output and never leaves the browser. A fresh device reads
-- these rows back and decrypts them with the same passkey. Service role only.
create table if not exists public.sealed_slips (
  id bigint generated always as identity primary key,
  address text not null,
  sealed text not null,
  created_at timestamptz not null default now(),
  unique (address, sealed)
);

create index if not exists sealed_slips_address_created_idx
  on public.sealed_slips (address, created_at desc);

alter table public.sealed_slips enable row level security;
