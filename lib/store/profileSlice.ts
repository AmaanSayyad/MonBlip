import { StateCreator } from 'zustand';
import { supabase } from '../supabase/client';
import { balanceMutationHeaders } from '@/lib/balance/balanceClientHeaders';
import { readStored, writeStored } from '@/lib/brand/browserStore';

export interface ProfileState {
    username: string | null;
    accessCode: string | null;
    isUpdatingUsername: boolean;
    recentTrades: any[];
    isLoadingTrades: boolean;
    fetchProfile: (address: string) => Promise<void>;
    updateUsername: (address: string, username: string) => Promise<boolean>;
    fetchRecentTrades: (address: string) => Promise<void>;
}

const TRADES_CACHE_PREFIX = 'monblip.settled.rounds:';
const tradesInflight = new Map<string, Promise<void>>();

function readCachedTrades(address: string): unknown[] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(TRADES_CACHE_PREFIX + address)
            || sessionStorage.getItem('tapt_settled_rounds_v1:' + address);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function writeCachedTrades(address: string, bets: unknown[]) {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(TRADES_CACHE_PREFIX + address, JSON.stringify(bets));
    } catch {
        // Private mode or a full cache should not block the list.
    }
}

export const createProfileSlice: StateCreator<ProfileState> = (set, get) => ({
    username: readStored('monblip.username', ['bynomo_username']),
    accessCode: readStored('monblip.access.code', ['bynomo_access_code']),
    isUpdatingUsername: false,
    recentTrades: [],
    isLoadingTrades: false,
    fetchProfile: async (address: string) => {
        if (!address || address.startsWith('0xDEMO')) return;
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('username, access_code')
                .eq('user_address', address)
                .single();

            if (data) {
                set({
                    username: data.username,
                    accessCode: data.access_code
                });
                if (typeof window !== 'undefined') {
                    if (data.username) writeStored('monblip.username', data.username);
                    if (data.access_code) writeStored('monblip.access.code', data.access_code);
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    },

    updateUsername: async (address: string, username: string) => {
        set({ isUpdatingUsername: true });
        try {
            // Check if username is already taken
            const { data: existing } = await supabase
                .from('user_profiles')
                .select('user_address')
                .eq('username', username)
                .single();

            if (existing && existing.user_address !== address) {
                throw new Error('Username already taken');
            }

            const { error } = await supabase
                .from('user_profiles')
                .upsert({
                    user_address: address,
                    username: username,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            set({ username });
            return true;
        } catch (error: any) {
            console.error('Error updating username:', error);
            return false;
        } finally {
            set({ isUpdatingUsername: false });
        }
    },

    fetchRecentTrades: async (address: string) => {
        if (!address) return;
        const pending = tradesInflight.get(address);
        if (pending) return pending;

        const run = (async () => {
            const cached = readCachedTrades(address);
            // Keep the last list on screen. The spinner is only for a first load.
            if (cached) set({ recentTrades: cached, isLoadingTrades: false });
            else set({ recentTrades: [], isLoadingTrades: true });

            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 8000);
            try {
                // bet_history is not readable with the browser anon key after RLS hardening
                // (see supabase/migrations/004_enable_rls.sql). Use the service-backed API instead.
                const res = await fetch(
                    `/api/bets/history?wallet=${encodeURIComponent(address)}&limit=10`,
                    { headers: { ...balanceMutationHeaders() }, signal: controller.signal },
                );
                if (!res.ok) {
                    console.warn('fetchRecentTrades: API error', res.status);
                    if (!cached) set({ recentTrades: [] });
                    return;
                }
                const json = (await res.json()) as { bets?: unknown[] };
                const bets = Array.isArray(json.bets) ? json.bets : [];
                set({ recentTrades: bets });
                writeCachedTrades(address, bets);
            } catch (error) {
                if (!cached) {
                    console.error('Error fetching recent trades:', error);
                    set({ recentTrades: [] });
                }
            } finally {
                window.clearTimeout(timer);
                set({ isLoadingTrades: false });
            }
        })();

        tradesInflight.set(address, run);
        try {
            await run;
        } finally {
            tradesInflight.delete(address);
        }
    },

});
