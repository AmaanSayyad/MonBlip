import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { stateFile, writeState } from '@/lib/server/stateFile';

const file = stateFile('.slips', 'journal.json');
const KEEP = 20;

type Journal = Record<string, string[]>;

async function load(): Promise<Journal> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Journal;
  } catch {
    return {};
  }
}

async function database() {
  try {
    return (await import('@/lib/supabase/serviceClient')).supabaseService;
  } catch {
    return null;
  }
}

/** Ciphertext only. The slip key stays in the passkey PRF output. */
export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get('address')?.toLowerCase() || '';
  if (!address.startsWith('0x')) return NextResponse.json({ slips: [] });
  const db = await database();
  if (db) {
    const { data, error } = await db
      .from('sealed_slips')
      .select('sealed')
      .eq('address', address)
      .order('created_at', { ascending: false })
      .limit(KEEP);
    if (!error && data) return NextResponse.json({ slips: data.map((row) => row.sealed) });
  }
  const journal = await load();
  return NextResponse.json({ slips: journal[address] || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const address = typeof body.address === 'string' ? body.address.toLowerCase() : '';
  const sealed = typeof body.sealed === 'string' ? body.sealed : '';
  if (!address.startsWith('0x') || sealed.length < 16) {
    return NextResponse.json({ error: 'address and sealed slip are required' }, { status: 400 });
  }
  const journal = await load();
  const prior = journal[address] || [];
  journal[address] = [sealed, ...prior.filter((row) => row !== sealed)].slice(0, KEEP);
  await writeState(file, JSON.stringify(journal)).catch(() => {});
  const db = await database();
  if (db) {
    const { error } = await db
      .from('sealed_slips')
      .upsert({ address, sealed }, { onConflict: 'address,sealed', ignoreDuplicates: true });
    if (error) console.warn('[slip] not stored', error.message);
  }
  return NextResponse.json({ stored: journal[address].length });
}
