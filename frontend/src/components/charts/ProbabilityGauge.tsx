import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

const LEVEL_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
  LOW: '#22C55E',
};

interface ProbabilityGaugeProps {
  probability: number | null | undefined;
  riskLevel?: string | null;
}

/** Radial gauge for a single stored fraud probability (0–1). */
export default function ProbabilityGauge({ probability, riskLevel }: ProbabilityGaugeProps) {
  if (probability === null || probability === undefined || Number.isNaN(probability)) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        Not scored — no probability available.
      </div>
    );
  }

  const pct = Math.round(probability * 100);
  const color = LEVEL_COLORS[riskLevel ?? ''] ?? '#3B82F6';
  const data = [{ name: 'fraud', value: pct, fill: color }];

  return (
    <div className="relative h-48" role="img" aria-label={`Fraud probability ${pct}%`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={210}
          endAngle={-30}
          barSize={18}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={9} background={{ fill: '#1e293b' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-white tabular-nums">{pct}%</span>
        <span className="text-xs uppercase tracking-wider text-slate-400 mt-1">
          Fraud Probability
        </span>
      </div>
    </div>
  );
}
