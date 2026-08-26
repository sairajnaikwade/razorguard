import { useNavigate } from 'react-router-dom';

import type { Transaction } from '../../services/api';
import Badge, { decisionVariant, riskLevelVariant } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { SearchX } from 'lucide-react';

interface TransactionsTableProps {
  items: Transaction[];
  loading?: boolean;
  /** Hide customer column (already on an investigation page for that customer). */
  compact?: boolean;
}

function fmtAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtTimestamp(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtProbability(p: number | null): string {
  return p === null ? '—' : `${(p * 100).toFixed(1)}%`;
}

export default function TransactionsTable({ items, loading, compact }: TransactionsTableProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        <span className="animate-pulse">Loading transactions…</span>
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={<SearchX size={36} />}
        title="No scored transactions yet."
        description="Transactions appear here after they are scored by the fraud detection model."
      />
    );
  }

  const headers = [
    'Transaction ID',
    'Amount',
    ...(compact ? [] : ['Customer']),
    'Payment Method',
    'Country',
    'Fraud Probability',
    'Risk Level',
    'Decision',
    'Timestamp',
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr
              key={t.id}
              onClick={() => navigate(`/transactions/${encodeURIComponent(t.transaction_id)}`)}
              className="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                {t.transaction_id}
              </td>
              <td className="px-4 py-3 tabular-nums text-slate-200 whitespace-nowrap">
                {fmtAmount(t.amount, t.currency)}
              </td>
              {!compact && (
                <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                  {t.customer_id}
                </td>
              )}
              <td className="px-4 py-3 capitalize text-slate-300">{t.payment_method ?? '—'}</td>
              <td className="px-4 py-3 text-slate-300">{t.country ?? '—'}</td>
              <td className="px-4 py-3 tabular-nums text-slate-200">
                {fmtProbability(t.fraud_probability)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={riskLevelVariant(t.risk_level)}>{t.risk_level ?? 'UNSCORED'}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant={decisionVariant(t.decision)}>{t.decision ?? '—'}</Badge>
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                {fmtTimestamp(t.scored_at ?? t.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
