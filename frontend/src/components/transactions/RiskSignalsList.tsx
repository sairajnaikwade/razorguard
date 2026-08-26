import { ShieldAlert } from 'lucide-react';

interface RiskSignalsListProps {
  signals: string[];
}

/**
 * Renders the risk signals persisted at scoring time. These are independent
 * observations derived from real feature values — not model explanations.
 */
export default function RiskSignalsList({ signals }: RiskSignalsListProps) {
  if (!signals.length) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center">
        No risk signals recorded for this transaction.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Risk signals">
      {signals.map((signal) => (
        <li
          key={signal}
          className="flex items-start gap-2 text-sm text-slate-200 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2"
        >
          <ShieldAlert size={16} className="text-risk-high mt-0.5 shrink-0" aria-hidden />
          <span>{signal}</span>
        </li>
      ))}
    </ul>
  );
}
