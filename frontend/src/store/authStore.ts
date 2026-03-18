import { create } from 'zustand';
import { supabase, getSession } from '../lib/supabase';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  initialized: false,

  initialize: async () => {
    try {
      const session = await getSession();
      if (session?.user) {
        set({
          user: {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
            avatar_url: session.user.user_metadata?.avatar_url,
          },
          initialized: true,
          loading: false,
        });
      } else {
        set({ initialized: true, loading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize auth',
        initialized: true,
        loading: false,
      });
    }
  },

  setUser: (user) => {
    set({ user });
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
      set({ user: null });
      localStorage.removeItem('noir_company_id');
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to logout',
      });
    }
  },
}));
