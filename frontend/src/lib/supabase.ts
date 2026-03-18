import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghzvppbkuudkpzlcidlx.supabase.co';
const SUPABASE_ANON_KEY = (import.meta.env as any).VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_ANON_KEY not set in environment');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data.session;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}
