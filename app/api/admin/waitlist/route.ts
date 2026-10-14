import { NextRequest, NextResponse } from 'next/server';
import type { WaitlistEntry } from '@/lib/supabase/client';
import { supabaseService } from '@/lib/supabase/serviceClient';
import { requireAdminAuth } from '@/lib/admin/requireAdminAuth';

export async function GET(request: NextRequest) {
    const deny = requireAdminAuth(request);
    if (deny) return deny;
    try {
        const { data, error } = await supabaseService
            .from('waitlist')
            .select('id,email,created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ waitlist: (data as WaitlistEntry[] | null) ?? [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
