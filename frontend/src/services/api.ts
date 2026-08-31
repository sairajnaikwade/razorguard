import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '../store/authStore';

// ---------------------------------------------------------------------------
// Types — mirror backend Pydantic schemas exactly.
// ---------------------------------------------------------------------------

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Decision = 'ALLOW' | 'MONITOR' | 'REVIEW';
export type UserRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

/** Mirrors app.schemas.transaction.TransactionRead */
export interface Transaction {
  id: string;
  transaction_id: string;
  customer_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  status: string;
  device_id: string | null;
  payment_method: string | null;
  country: string | null;
  fraud_probability: number | null;
  risk_level: RiskLevel | null;
  decision: Decision | null;
  model_version: string | null;
  scored_at: string | null;
  created_at: string;
}

/** Mirrors app.schemas.transaction.TransactionDetailResponse */
export interface TransactionDetail extends Transaction {
  risk_signals: string[];
  updated_at: string | null;
}

/** Mirrors app.schemas.transaction.PaginationMeta */
export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/**
 * Mirrors app.schemas.transaction.TransactionSummary.
 * All aggregates are computed server-side over the FULL filtered set —
 * never derived from the current page in the browser.
 *
 * "predicted" counts are model outputs, not confirmed fraud labels.
 * estimated_expected_loss is a modeled estimate (see docs), not confirmed loss.
 */
export interface TransactionSummary {
  total_transactions: number;
  predicted_fraud_count: number;
  high_critical_count: number;
  review_queue_count: number;
  predicted_fraud_rate: number;
  risk_level_counts: Record<RiskLevel, number>;
  estimated_expected_loss: number | null;
  expected_loss_currency: string;
}

/** Mirrors app.schemas.transaction.TransactionListResponse */
export interface TransactionListResponse {
  items: Transaction[];
  pagination: PaginationMeta;
  summary: TransactionSummary;
}

/** Mirrors app.schemas.audit.AuditEventResponse */
export interface AuditEvent {
  id: string;
  event: string;
  actor: string | null;
  transaction_id: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

/** Mirrors app.schemas.ml.MLStatusResponse */
export interface MLStatus {
  status: string;
  model_name: string | null;
  model_type: string | null;
  threshold: number | null;
  feature_count: number;
  model_version: string | null;
}

/** Mirrors app.schemas.ml.MLMetricsResponse — synthetic held-out metrics. */
export interface MLMetrics {
  label: string;
  note: string;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  roc_auc: number | null;
  pr_auc: number | null;
  true_positive: number | null;
  true_negative: number | null;
  false_positive: number | null;
  false_negative: number | null;
  false_positive_cost: number | null;
  false_negative_cost: number | null;
  total_expected_loss: number | null;
  threshold: number | null;
}

/** Mirrors app.schemas.common.HealthResponse */
export interface HealthStatus {
  status: string;
  database: string;
  redis: string;
  ml_model: string;
}

/** Mirrors app.schemas.ai.AIInvestigationResponse */
export interface AIInvestigationReport {
  summary: string;
  key_evidence: string[];
  risk_reasoning: string;
  recommended_action: string;
  confidence: number;
  limitations: string[];
  is_mock: boolean;
}

/** Mirrors app.schemas.transaction.TransactionScoreRequest */
export interface ScoreRequest {
  transaction_id: string;
  customer_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  timestamp: string;
  payment_method: string;
  device_id: string;
  country: string;
  ip_region: string;
  customer_account_age: number;
  historical_transaction_count: number;
  historical_failure_count: number;
  failed_attempts: number;
  new_device: 0 | 1;
  unusual_country: 0 | 1;
  payment_method_change: 0 | 1;
}

/** Mirrors app.schemas.transaction.TransactionScoreResponse */
export interface ScoreResponse {
  transaction_id: string;
  fraud_probability: number;
  risk_level: RiskLevel;
  threshold: number;
  decision: Decision;
  risk_signals: string[];
  model_version: string;
  scored_at: string;
}

/** Query params accepted by GET /api/transactions (server-side filtering). */
export interface TransactionQueryParams {
  page?: number;
  page_size?: number;
  risk_level?: string; // comma-separated LOW,MEDIUM,HIGH,CRITICAL
  decision?: string; // comma-separated ALLOW,MONITOR,REVIEW
  payment_method?: string;
  country?: string;
  customer_id?: string;
  date_from?: string;
  date_to?: string;
  min_fraud_probability?: number;
  max_fraud_probability?: number;
  sort_by?: 'created_at' | 'scored_at' | 'amount' | 'fraud_probability';
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Axios instance + interceptors
// ---------------------------------------------------------------------------

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30_000, // 30 s — prevents requests hanging indefinitely
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear stale credentials and send the user to login. The pathname
      // guard prevents an infinite redirect loop for requests made while
      // already sitting on /login (e.g. a failed login attempt).
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Typed API clients
// ---------------------------------------------------------------------------

export const transactionsApi = {
  list: async (params: TransactionQueryParams): Promise<TransactionListResponse> => {
    const { data } = await api.get<TransactionListResponse>('/transactions', { params });
    return data;
  },
  detail: async (transactionId: string): Promise<TransactionDetail> => {
    const { data } = await api.get<TransactionDetail>(`/transactions/${encodeURIComponent(transactionId)}`);
    return data;
  },
  score: async (payload: ScoreRequest): Promise<ScoreResponse> => {
    const { data } = await api.post<ScoreResponse>('/transactions/score', payload);
    return data;
  },
};

export const auditApi = {
  listByTransaction: async (transactionId: string, limit = 100): Promise<AuditEvent[]> => {
    const { data } = await api.get<AuditEvent[]>('/audit', {
      params: { transaction_id: transactionId, limit },
    });
    return data;
  },
};

export const mlApi = {
  status: async (): Promise<MLStatus> => {
    const { data } = await api.get<MLStatus>('/ml/status');
    return data;
  },
  metrics: async (): Promise<MLMetrics> => {
    const { data } = await api.get<MLMetrics>('/ml/metrics');
    return data;
  },
};

export const healthApi = {
  check: async (): Promise<HealthStatus> => {
    try {
      const { data } = await api.get<HealthStatus>('/system/health');
      return data;
    } catch (err: unknown) {
      // Health reports degraded state via HTTP 503 — the body is still useful.
      if (axios.isAxiosError(err) && err.response?.data) {
        return err.response.data as HealthStatus;
      }
      throw err;
    }
  },
};

export const investigateApi = {
  /** Generate (or serve cached) AI investigation report. ANALYST/ADMIN only. */
  generate: async (
    transactionId: string,
    regenerate = false,
  ): Promise<AIInvestigationReport> => {
    const { data } = await api.post<AIInvestigationReport>(
      `/transactions/${encodeURIComponent(transactionId)}/investigate`,
      null,
      { params: regenerate ? { regenerate: true } : undefined },
    );
    return data;
  },
  /** Fetch an already-generated report. VIEWER-accessible. */
  fetch: async (transactionId: string): Promise<AIInvestigationReport> => {
    const { data } = await api.get<AIInvestigationReport>(
      `/transactions/${encodeURIComponent(transactionId)}/investigate`,
    );
    return data;
  },
};
