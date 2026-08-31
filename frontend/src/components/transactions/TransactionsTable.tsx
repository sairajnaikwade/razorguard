import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, SearchX } from 'lucide-react';

import type { Transaction } from '../../services/api';
import Badge, { decisionVariant, riskLevelVariant } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';

interface TransactionsTableProps {
  items: Transaction[];
  loading?: boolean;
  compact?: boolean;
}

function fmtAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount);
}

function fmtTimestamp(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtTimestampShort(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtProbability(p: number | null): string {
  return p === null ? '—' : `${(p * 100).toFixed(1)}%`;
}

function probClass(p: number | null): string {
  if (p === null) return 'text-slate-500';
  if (p >= 0.7) return 'text-risk-critical font-bold';
  if (p >= 0.5) return 'text-risk-high font-semibold';
  if (p >= 0.3) return 'text-risk-medium';
  return 'text-slate-400';
}

function rowTint(riskLevel: string | null | undefined): string {
  if (riskLevel === 'CRITICAL') return 'row-critical';
  if (riskLevel === 'HIGH')     return 'row-high';
  return '';
}

// ─── Mobile card ─────────────────────────────────────────────────────────────
function MobileCard({ t, onClick }: { t: Transaction; onClick: () => void }) {
  const prob = t.fraud_probability ?? 0;
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 border-b border-[#142238] hover:bg-white/[0.02] transition-colors"
    >
      {/* Row 1: ID + arrow */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="mono-id text-slate-300 truncate flex-1">{t.transaction_id}</span>
        <ArrowUpRight size={13} className="text-slate-600 shrink-0" />
      </div>

      {/* Row 2: amount + probability */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-bold tabular-nums text-white">
          {fmtAmount(t.amount, t.currency)}
        </span>
        <span className={`text-sm tabular-nums font-bold ${probClass(prob)}`}>
          {fmtProbability(t.fraud_probability)}
        </span>
      </div>

      {/* Row 3: badges + time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-1.5 py-0">
            {t.risk_level ?? 'UNSCORED'}
          </Badge>
          <Badge variant={decisionVariant(t.decision)} className="text-[10px] px-1.5 py-0">
            {t.decision ?? '—'}
          </Badge>
        </div>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {fmtTimestampShort(t.scored_at ?? t.created_at)}
        </span>
      </div>

      {/* Row 4: customer + method + country */}
      <div className="mt-2 pt-2 border-t border-[#142238] flex items-center gap-2 text-[10px] text-slate-500">
        <span className="mono-id truncate">{t.customer_id}</span>
        <span>·</span>
        <span className="capitalize">{t.payment_method ?? '—'}</span>
        {t.country && <><span>·</span><span>{t.country}</span></>}
      </div>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TransactionsTable({ items, loading, compact }: TransactionsTableProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="py-12 text-center">
        <span className="text-slate-500 text-sm">Loading transactions…</span>
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={<SearchX size={28} />}
        title="No transactions match your filters."
        description="Try adjusting or clearing the active filters."
      />
    );
  }

  const goTo = (txnId: string) =>
    navigate(`/transactions/${encodeURIComponent(txnId)}`);

  const headers: { label: string; cls?: string }[] = [
    { label: 'Transaction ID',    cls: 'w-[220px]' },
    { label: 'Amount',            cls: 'w-[110px]' },
    ...(!compact ? [{ label: 'Customer', cls: 'w-[130px]' }] : []),
    { label: 'Method',            cls: 'w-[90px]' },
    { label: 'Country',           cls: 'w-[70px]' },
    { label: 'Fraud %',           cls: 'w-[80px]' },
    { label: 'Risk',              cls: 'w-[90px]' },
    { label: 'Decision',          cls: 'w-[90px]' },
    { label: 'Scored At',         cls: '' },
    { label: '',                  cls: 'w-[32px]' },
  ];

  return (
    <>
      {/* ── Desktop table ─────────────────────────────────────────── */}
      <div className="hidden sm:block table-responsive">
        <table className="w-full text-sm text-left min-w-[700px]">
          <thead>
            <tr className="border-b border-[#142238]">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap first:pl-5 last:pr-5 ${h.cls ?? ''}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#142238]">
            {items.map((t) => (
              <tr
                key={t.id}
                onClick={() => goTo(t.transaction_id)}
                className={`hover:bg-white/[0.025] cursor-pointer transition-colors group ${rowTint(t.risk_level)}`}
              >
                {/* Transaction ID */}
                <td className="px-4 py-3 pl-5">
                  <span className="mono-id text-slate-300 group-hover:text-white transition-colors">
                    {t.transaction_id}
                  </span>
                </td>
                {/* Amount */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="tabular-nums text-slate-200 font-semibold text-sm">
                    {fmtAmount(t.amount, t.currency)}
                  </span>
                </td>
                {/* Customer (unless compact) */}
                {!compact && (
                  <td className="px-4 py-3">
                    <span className="mono-id text-slate-400">
                      {t.customer_id}
                    </span>
                  </td>
                )}
                {/* Method */}
                <td className="px-4 py-3 capitalize text-slate-400 text-xs whitespace-nowrap">
                  {t.payment_method ?? '—'}
                </td>
                {/* Country */}
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {t.country ?? '—'}
                </td>
                {/* Fraud probability — most important metric, visually prominent */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`tabular-nums text-sm ${probClass(t.fraud_probability)}`}>
                    {fmtProbability(t.fraud_probability)}
                  </span>
                </td>
                {/* Risk badge */}
                <td className="px-4 py-3">
                  <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-1.5 py-0">
                    {t.risk_level ?? 'UNSCORED'}
                  </Badge>
                </td>
                {/* Decision badge */}
                <td className="px-4 py-3">
                  <Badge variant={decisionVariant(t.decision)} className="text-[10px] px-1.5 py-0">
                    {t.decision ?? '—'}
                  </Badge>
                </td>
                {/* Scored at */}
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap tabular-nums">
                  {fmtTimestamp(t.scored_at ?? t.created_at)}
                </td>
                {/* Arrow */}
                <td className="px-4 py-3 pr-5">
                  <ArrowUpRight
                    size={13}
                    className="text-slate-700 group-hover:text-primary transition-colors"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile list ───────────────────────────────────────────── */}
      <div className="sm:hidden divide-y divide-[#142238]">
        {items.map((t) => (
          <MobileCard
            key={t.id}
            t={t}
            onClick={() => goTo(t.transaction_id)}
          />
        ))}
      </div>
    </>
  );
}
