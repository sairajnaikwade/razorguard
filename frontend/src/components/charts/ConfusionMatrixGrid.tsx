interface ConfusionMatrixGridProps {
  tp: number | null;
  tn: number | null;
  fp: number | null;
  fn: number | null;
}

function Cell({
  label,
  sublabel,
  value,
  tone,
}: {
  label: string;
  sublabel: string;
  value: number | null;
  tone: string;
}) {
  return (
    <div className={`rounded-lg border p-4 text-center ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value ?? '—'}</p>
      <p className="text-[11px] mt-1 opacity-70">{sublabel}</p>
    </div>
  );
}

/**
 * 2x2 confusion matrix from the stored held-out evaluation. Plain HTML/CSS —
 * the API provides only scalar metrics, so nothing is charted/fabricated.
 */
export default function ConfusionMatrixGrid({ tp, tn, fp, fn }: ConfusionMatrixGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
      <Cell label="TP" sublabel="Fraud caught" value={tp} tone="border-risk-low/40 bg-risk-low/10 text-risk-low" />
      <Cell label="FP" sublabel="Legitimate flagged" value={fp} tone="border-risk-high/40 bg-risk-high/10 text-risk-high" />
      <Cell label="FN" sublabel="Fraud missed" value={fn} tone="border-risk-critical/40 bg-risk-critical/10 text-risk-critical" />
      <Cell label="TN" sublabel="Legitimate allowed" value={tn} tone="border-primary/40 bg-primary/10 text-primary" />
    </div>
  );
}
