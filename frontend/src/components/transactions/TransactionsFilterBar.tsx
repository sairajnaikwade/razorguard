import { Filter, X } from 'lucide-react';

export interface TransactionFilters {
  risk_level: string;
  decision: string;
  payment_method: string;
  country: string;
  date_from: string;
  date_to: string;
  min_fraud_probability: string;
  max_fraud_probability: string;
}

export const EMPTY_FILTERS: TransactionFilters = {
  risk_level: '', decision: '', payment_method: '', country: '',
  date_from: '', date_to: '', min_fraud_probability: '', max_fraud_probability: '',
};

interface TransactionsFilterBarProps {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  onApply: () => void;
  onReset: () => void;
}

const RISK_OPTIONS     = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const DECISION_OPTIONS = ['ALLOW', 'MONITOR', 'REVIEW'] as const;
const PAYMENT_OPTIONS  = ['card', 'upi', 'netbanking'] as const;

// Shared input/select style — compact, enterprise dark
const fieldCls =
  'bg-[#06101F] border border-[#142238] rounded px-2.5 py-1.5 text-xs text-slate-200 ' +
  'focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 ' +
  'transition-colors w-full placeholder:text-slate-600 h-8 ' +
  'hover:border-[#1E3A5F]';

const labelCls = 'block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1';

export default function TransactionsFilterBar({
  filters, onChange, onApply, onReset,
}: TransactionsFilterBarProps) {
  const set = (patch: Partial<TransactionFilters>) => onChange({ ...filters, ...patch });
  const hasFilters = Object.values(filters).some((v) => v !== '');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onApply();
  };

  return (
    <div onKeyDown={handleKeyDown}>
      {/* ── Toolbar row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-[#142238]">

        {/* Risk */}
        <div className="min-w-[110px] flex-1 sm:flex-none sm:w-[110px]">
          <label className={labelCls}>Risk</label>
          <select className={fieldCls} value={filters.risk_level} onChange={(e) => set({ risk_level: e.target.value })}>
            <option value="">All risks</option>
            {RISK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Decision */}
        <div className="min-w-[110px] flex-1 sm:flex-none sm:w-[110px]">
          <label className={labelCls}>Decision</label>
          <select className={fieldCls} value={filters.decision} onChange={(e) => set({ decision: e.target.value })}>
            <option value="">All decisions</option>
            {DECISION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Method */}
        <div className="min-w-[100px] flex-1 sm:flex-none sm:w-[110px]">
          <label className={labelCls}>Method</label>
          <select className={fieldCls} value={filters.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>
            <option value="">All methods</option>
            {PAYMENT_OPTIONS.map((o) => <option key={o} value={o} className="capitalize">{o}</option>)}
          </select>
        </div>

        {/* Country */}
        <div className="min-w-[80px] flex-1 sm:flex-none sm:w-[80px]">
          <label className={labelCls}>Country</label>
          <input
            className={fieldCls}
            placeholder="IN, US…"
            maxLength={2}
            value={filters.country}
            onChange={(e) => set({ country: e.target.value.toUpperCase() })}
          />
        </div>

        {/* Date from */}
        <div className="min-w-[130px] flex-1 sm:flex-none sm:w-[130px]">
          <label className={labelCls}>From</label>
          <input
            type="date"
            className={`${fieldCls} [color-scheme:dark]`}
            value={filters.date_from}
            onChange={(e) => set({ date_from: e.target.value })}
          />
        </div>

        {/* Date to */}
        <div className="min-w-[130px] flex-1 sm:flex-none sm:w-[130px]">
          <label className={labelCls}>To</label>
          <input
            type="date"
            className={`${fieldCls} [color-scheme:dark]`}
            value={filters.date_to}
            onChange={(e) => set({ date_to: e.target.value })}
          />
        </div>

        {/* Min prob */}
        <div className="min-w-[90px] flex-1 sm:flex-none sm:w-[90px]">
          <label className={labelCls}>Min P</label>
          <input
            type="number" min={0} max={1} step={0.05} placeholder="0–1"
            className={fieldCls}
            value={filters.min_fraud_probability}
            onChange={(e) => set({ min_fraud_probability: e.target.value })}
          />
        </div>

        {/* Max prob */}
        <div className="min-w-[90px] flex-1 sm:flex-none sm:w-[90px]">
          <label className={labelCls}>Max P</label>
          <input
            type="number" min={0} max={1} step={0.05} placeholder="0–1"
            className={fieldCls}
            value={filters.max_fraud_probability}
            onChange={(e) => set({ max_fraud_probability: e.target.value })}
          />
        </div>

        {/* Action buttons — right-aligned */}
        <div className="flex items-end gap-2 ml-auto shrink-0 pb-px">
          <button
            type="button"
            onClick={onApply}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-white transition-colors"
          >
            <Filter size={11} />
            Apply
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium bg-transparent border border-[#142238] text-slate-400 hover:text-white hover:border-[#1E3A5F] transition-colors"
            >
              <X size={11} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Active filter chips ─────────────────────────────────────── */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-[#142238]">
          {filters.risk_level && (
            <Chip label={`Risk: ${filters.risk_level}`} onRemove={() => set({ risk_level: '' })} />
          )}
          {filters.decision && (
            <Chip label={`Decision: ${filters.decision}`} onRemove={() => set({ decision: '' })} />
          )}
          {filters.payment_method && (
            <Chip label={`Method: ${filters.payment_method}`} onRemove={() => set({ payment_method: '' })} />
          )}
          {filters.country && (
            <Chip label={`Country: ${filters.country}`} onRemove={() => set({ country: '' })} />
          )}
          {filters.date_from && (
            <Chip label={`From: ${filters.date_from}`} onRemove={() => set({ date_from: '' })} />
          )}
          {filters.date_to && (
            <Chip label={`To: ${filters.date_to}`} onRemove={() => set({ date_to: '' })} />
          )}
          {filters.min_fraud_probability && (
            <Chip label={`P ≥ ${filters.min_fraud_probability}`} onRemove={() => set({ min_fraud_probability: '' })} />
          )}
          {filters.max_fraud_probability && (
            <Chip label={`P ≤ ${filters.max_fraud_probability}`} onRemove={() => set({ max_fraud_probability: '' })} />
          )}
          <span className="ml-auto text-[10px] text-slate-600 self-center hidden sm:block">
            Filters reflected in URL
          </span>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 border border-primary/25 text-[11px] text-primary font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-primary/50 hover:text-primary ml-0.5 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X size={9} />
      </button>
    </span>
  );
}
