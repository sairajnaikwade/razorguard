import { create } from 'zustand';

import {
  transactionsApi,
  type TransactionListResponse,
  type TransactionQueryParams,
} from '../services/api';

interface TransactionsState {
  data: TransactionListResponse | null;
  loading: boolean;
  error: string | null;
  /** Last executed params — lets pages re-fetch after scoring. */
  lastParams: TransactionQueryParams | null;
  fetch: (params: TransactionQueryParams) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
}

/**
 * Holds explorer/dashboard list results. Filters themselves live in the URL
 * query string (pages own them); this store only caches the server response.
 */
export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  lastParams: null,

  fetch: async (params) => {
    set({ loading: true, error: null, lastParams: params });
    try {
      const data = await transactionsApi.list(params);
      set({ data, loading: false });
    } catch {
      // Preserve existing data so the table stays visible on a failed refresh.
      // Only clear data on the very first load (when data is null).
      set((prev) => ({
        loading: false,
        error: 'Unable to load transactions. Please try again.',
        data: prev.data ?? null,
      }));
    }
  },

  refresh: async () => {
    const { lastParams } = get();
    if (lastParams) await get().fetch(lastParams);
  },

  clear: () => set({ data: null, loading: false, error: null, lastParams: null }),
}));
