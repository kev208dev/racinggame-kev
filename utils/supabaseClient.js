import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://fcexjurcapptmiagdcxn.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_b7fJ1n3J0WMDV2x8XQqwFQ_kzxWPZ2S';

let supabase = null;

export function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabase;
}
