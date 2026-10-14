import { NextResponse } from 'next/server';
import { COOKIE_NAME, LEGACY_COOKIE_NAME } from '@/lib/admin/adminToken';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of [COOKIE_NAME, LEGACY_COOKIE_NAME]) {
    res.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });
  }
  return res;
}
