import { create } from 'zustand';
import type { User } from '../types';

const STORAGE_KEY = 'noir_authenticated';
const PASSWORD = 'noirfactory2026';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  setUser: (user: User | null) => void;
  login: (password: string) => boolean;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  initialized: false,

  initialize: async () => {
    const isAuth = localStorage.getItem(STORAGE_KEY);
    if (isAuth === 'true') {
      set({
        user: {
          id: 'admin',
          email: 'info@rawfunds.com',
          name: 'RAWFUNDS',
          avatar_url: undefined,
        },
        initialized: true,
        loading: false,
      });
    } else {
      set({ initialized: true, loading: false });
    }
  },

  login: (password: string) => {
    if (password === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, 'true');
      set({
        user: {
          id: 'admin',
          email: 'info@rawfunds.com',
          name: 'RAWFUNDS',
          avatar_url: undefined,
        },
        error: null,
      });
      return true;
    }
    set({ error: 'Wrong password' });
    return false;
  },

  setUser: (user) => {
    set({ user });
  },

  logout: async () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('noir_company_id');
    set({ user: null });
  },
}));
