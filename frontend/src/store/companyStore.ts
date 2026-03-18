import { create } from 'zustand';
import type { Company } from '../types';
import * as api from '../lib/api';

interface CompanyState {
  companies: Company[];
  currentCompany: Company | null;
  loading: boolean;
  error: string | null;
  fetchCompanies: () => Promise<void>;
  setCurrentCompany: (company: Company) => void;
  initializeCompany: () => Promise<void>;
}

export const useCompanyStore = create<CompanyState>((set) => ({
  companies: [],
  currentCompany: null,
  loading: false,
  error: null,

  fetchCompanies: async () => {
    set({ loading: true });
    try {
      const companies = await api.getCompanies();
      set({ companies, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch companies',
        loading: false,
      });
    }
  },

  setCurrentCompany: (company) => {
    localStorage.setItem('noir_company_id', company.id);
    set({ currentCompany: company });
  },

  initializeCompany: async () => {
    try {
      const companies = await api.getCompanies();
      set({ companies });

      const savedCompanyId = localStorage.getItem('noir_company_id');
      const company =
        companies.find((c: Company) => c.id === savedCompanyId) ||
        companies[0];

      if (company) {
        localStorage.setItem('noir_company_id', company.id);
        set({ currentCompany: company });
      }
    } catch (error) {
      console.error('Failed to initialize company:', error);
    }
  },
}));
