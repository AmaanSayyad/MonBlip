import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const file = path.join(process.cwd(), '.slips', 'journal.json');

type Journal = Record<string, string[]>;

async function load(): Promise<Journal> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Journal;
  } catch {
    return {};
  }
}

/** Ciphertext only. The slip key stays in the passkey PRF output. */
export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get('address')?.toLowerCase() || '';
  if (!address.startsWith('0x')) return NextResponse.json({ slips: [] });
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
  journal[address] = [sealed, ...prior.filter((row) => row !== sealed)].slice(0, 20);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(journal), { mode: 0o600 });
  return NextResponse.json({ stored: journal[address].length });
}
