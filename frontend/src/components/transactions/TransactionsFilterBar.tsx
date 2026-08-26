import Button from '../ui/Button';
import { RotateCw, X } from 'lucide-react';

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
  risk_level: '',
  decision: '',
  payment_method: '',
  country: '',
  date_from: '',
  date_to: '',
  min_fraud_probability: '',
  max_fraud_probability: '',
};

interface TransactionsFilterBarProps {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  onApply: () => void;
  onReset: () => void;
}

const RISK_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DECISION_OPTIONS = ['ALLOW', 'MONITOR', 'REVIEW'];
const PAYMENT_OPTIONS = ['card', 'upi', 'netbanking'];

const inputClass =
  'bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors w-full';

const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1';

export default function TransactionsFilterBar({
  filters,
  onChange,
  onApply,
  onReset,
}: TransactionsFilterBarProps) {
  const set = (patch: Partial<TransactionFilters>) => onChange({ ...filters, ...patch });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onApply();
  };

  return (
    <div className="p-4 space-y-3" onKeyDown={handleKeyDown}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div>
          <label className={labelClass}>Risk</label>
          <select
            className={inputClass}
            value={filters.risk_level}
            onChange={(e) => set({ risk_level: e.target.value })}
          >
            <option value="">All risks</option>
            {RISK_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Decision</label>
          <select
            className={inputClass}
            value={filters.decision}
            onChange={(e) => set({ decision: e.target.value })}
          >
            <option value="">All decisions</option>
            {DECISION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Payment Method</label>
          <select
            className={inputClass}
            value={filters.payment_method}
            onChange={(e) => set({ payment_method: e.target.value })}
          >
            <option value="">All methods</option>
            {PAYMENT_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Country</label>
          <input
            className={inputClass}
            placeholder="IN, US …"
            maxLength={2}
            value={filters.country}
            onChange={(e) => set({ country: e.target.value.toUpperCase() })}
          />
        </div>

        <div>
          <label className={labelClass}>From (date)</label>
          <input
            type="date"
            className={`${inputClass} [color-scheme:dark]`}
            value={filters.date_from}
            onChange={(e) => set({ date_from: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>To (date)</label>
          <input
            type="date"
            className={`${inputClass} [color-scheme:dark]`}
            value={filters.date_to}
            onChange={(e) => set({ date_to: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>Min probability</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="0 – 1"
            className={inputClass}
            value={filters.min_fraud_probability}
            onChange={(e) => set({ min_fraud_probability: e.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>Max probability</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="0 – 1"
            className={inputClass}
            value={filters.max_fraud_probability}
            onChange={(e) => set({ max_fraud_probability: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={onApply}>
          Apply Filters
        </Button>
        <Button size="sm" variant="secondary" onClick={onReset} type="button">
          <X size={14} /> Clear
        </Button>
        <span className="text-xs text-slate-600 ml-1 flex items-center gap-1">
          <RotateCw size={11} /> filters run server-side
        </span>
      </div>
    </div>
  );
}
