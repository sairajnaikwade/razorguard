interface ConfusionMatrixGridProps {
  tp: number | null;
  tn: number | null;
  fp: number | null;
  fn: number | null;
}

interface CellProps {
  abbr: string;
  label: string;
  value: number | null;
  valueClass: string;
  borderClass: string;
}

function Cell({ abbr, label, value, valueClass, borderClass }: CellProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-4 px-3 border ${borderClass} bg-[#06101F]`}>
      <span className={`text-xs font-bold uppercase tracking-wide ${valueClass} mb-1`}>{abbr}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>
        {value !== null ? value.toLocaleString('en-IN') : '—'}
      </span>
      <span className="text-[10px] text-slate-600 mt-1 text-center leading-tight">{label}</span>
    </div>
  );
}

/**
 * 2×2 confusion matrix. Plain HTML — no chart points fabricated.
 */
export default function ConfusionMatrixGrid({ tp, tn, fp, fn }: ConfusionMatrixGridProps) {
  return (
    <div className="grid grid-cols-2 gap-px bg-[#142238] border border-[#142238] rounded overflow-hidden max-w-sm mx-auto">
      <Cell abbr="TP" label="Fraud caught"        value={tp} valueClass="text-risk-low"      borderClass="border-0" />
      <Cell abbr="FP" label="Legit flagged"        value={fp} valueClass="text-risk-high"     borderClass="border-0" />
      <Cell abbr="FN" label="Fraud missed"         value={fn} valueClass="text-risk-critical" borderClass="border-0" />
      <Cell abbr="TN" label="Legit allowed"        value={tn} valueClass="text-primary"       borderClass="border-0" />
    </div>
  );
}
