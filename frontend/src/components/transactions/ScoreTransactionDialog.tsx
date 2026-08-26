import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, X } from 'lucide-react';

import { transactionsApi, type ScoreRequest, type ScoreResponse } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import Badge, { decisionVariant, riskLevelVariant } from '../ui/Badge';
import Button from '../ui/Button';
import RiskSignalsList from './RiskSignalsList';
import Spinner from '../ui/Spinner';

interface ScoreTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  onScored: (result: ScoreResponse) => void;
}

const inputClass =
  'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors';

const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1';

/** Example values mirror the documented API contract example (editable). */
function examplePayload(): ScoreRequest {
  return {
    transaction_id: `TXN_${Date.now().toString(36).toUpperCase()}`,
    customer_id: 'CUST_0042',
    merchant_id: 'MERCH_0010',
    amount: 240000,
    currency: 'INR',
    timestamp: new Date().toISOString(),
    payment_method: 'card',
    device_id: 'DEV_NEW_IP_XYZ',
    country: 'US',
    ip_region: 'REG_12',
    customer_account_age: 45,
    historical_transaction_count: 12,
    historical_failure_count: 0,
    failed_attempts: 3,
    new_device: 1,
    unusual_country: 1,
    payment_method_change: 1,
  };
}

export default function ScoreTransactionDialog({
  open,
  onClose,
  onScored,
}: ScoreTransactionDialogProps) {
  const role = useAuthStore((s) => s.user?.role);
  const [payload, setPayload] = useState<ScoreRequest>(() => examplePayload());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResponse | null>(null);

  // Cosmetic RBAC guard — backend remains the source of truth.
  const canScore = role === 'ADMIN' || role === 'ANALYST';

  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setPayload(examplePayload());
    }
  }, [open]);

  if (!open || !canScore) return null;

  const set = (patch: Partial<ScoreRequest>) => setPayload((p) => ({ ...p, ...patch }));

  const numField = (label: string, key: keyof Pick<ScoreRequest,
    'amount' | 'customer_account_age' | 'historical_transaction_count' |
    'historical_failure_count' | 'failed_attempts'>) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="number"
        min={0}
        className={inputClass}
        value={payload[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<ScoreRequest>)}
      />
    </div>
  );

  const flagField = (label: string, key: keyof Pick<ScoreRequest,
    'new_device' | 'unusual_country' | 'payment_method_change'>) => (
    <div>
      <label className={labelClass}>{label}</label>
      <select
        className={inputClass}
        value={payload[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<ScoreRequest>)}
      >
        <option value={0}>No</option>
        <option value={1}>Yes</option>
      </select>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await transactionsApi.score(payload);
      setResult(response);
      onScored(response);
    } catch (err: unknown) {
      interface ApiErrorDetail {
        response?: { status?: number; data?: { detail?: string } };
      }
      const apiErr = err as ApiErrorDetail;
      const detail = apiErr.response?.data?.detail;
      setError(
        detail ??
          'Failed to score the transaction. The ML model may be unavailable.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Score transaction"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="flex items-center gap-2 text-white font-bold">
            <FlaskConical size={18} className="text-primary" /> Score Transaction
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Fraud Probability</p>
                <p className="text-2xl font-bold text-white tabular-nums mt-1">
                  {(result.fraud_probability * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-4 flex flex-col items-center justify-center gap-2">
                <p className="text-xs uppercase tracking-wider text-slate-500">Risk Level</p>
                <Badge variant={riskLevelVariant(result.risk_level)}>{result.risk_level}</Badge>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-4 flex flex-col items-center justify-center gap-2">
                <p className="text-xs uppercase tracking-wider text-slate-500">Decision</p>
                <Badge variant={decisionVariant(result.decision)}>{result.decision}</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Risk signals</h3>
              <RiskSignalsList signals={result.risk_signals} />
            </div>

            <div className="text-xs text-slate-500">
              Model version: <span className="font-mono text-slate-400">{result.model_version}</span>{' '}
              · Threshold: {result.threshold}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <Link
                to={`/transactions/${encodeURIComponent(result.transaction_id)}`}
                onClick={onClose}
                className="text-sm text-primary hover:underline"
              >
                Open investigation →
              </Link>
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Transaction ID</label>
                <input
                  required
                  className={`${inputClass} font-mono`}
                  value={payload.transaction_id}
                  onChange={(e) => set({ transaction_id: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Timestamp (ISO 8601)</label>
                <input
                  required
                  className={inputClass}
                  value={payload.timestamp}
                  onChange={(e) => set({ timestamp: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Customer ID</label>
                <input
                  required
                  className={`${inputClass} font-mono`}
                  value={payload.customer_id}
                  onChange={(e) => set({ customer_id: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Merchant ID</label>
                <input
                  required
                  className={`${inputClass} font-mono`}
                  value={payload.merchant_id}
                  onChange={(e) => set({ merchant_id: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Amount (INR)</label>
                <input
                  required
                  type="number"
                  min={0.01}
                  step={0.01}
                  className={inputClass}
                  value={payload.amount}
                  onChange={(e) => set({ amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass}>Payment Method</label>
                <select
                  className={inputClass}
                  value={payload.payment_method}
                  onChange={(e) => set({ payment_method: e.target.value })}
                >
                  <option value="card">card</option>
                  <option value="upi">upi</option>
                  <option value="netbanking">netbanking</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Device ID</label>
                <input
                  required
                  className={`${inputClass} font-mono`}
                  value={payload.device_id}
                  onChange={(e) => set({ device_id: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Country</label>
                  <input
                    required
                    maxLength={2}
                    className={inputClass}
                    value={payload.country}
                    onChange={(e) => set({ country: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className={labelClass}>IP Region</label>
                  <input
                    required
                    className={inputClass}
                    value={payload.ip_region}
                    onChange={(e) => set({ ip_region: e.target.value })}
                  />
                </div>
              </div>
              {numField('Account age (days)', 'customer_account_age')}
              {numField('Historical txns', 'historical_transaction_count')}
              {numField('Historical failures', 'historical_failure_count')}
              {numField('Recent failed attempts', 'failed_attempts')}
              {flagField('New device', 'new_device')}
              {flagField('Unusual country', 'unusual_country')}
              {flagField('Payment method changed', 'payment_method_change')}
            </div>

            {error && (
              <div className="bg-risk-critical/10 border border-risk-critical/40 text-risk-critical p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="secondary" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner size={14} className="!text-white" /> Scoring…
                  </>
                ) : (
                  'Run Scoring'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
