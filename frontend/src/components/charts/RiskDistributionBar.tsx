import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import type { RiskLevel } from '../../services/api';

const LEVEL_COLORS: Record<RiskLevel, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
  LOW: '#22C55E',
};

interface RiskDistributionBarProps {
  counts: Record<RiskLevel, number>;
}

/**
 * Server-side risk-level counts rendered as a severity-ordered bar chart.
 * No fabricated points — empty data renders an explicit empty state.
 */
export default function RiskDistributionBar({ counts }: RiskDistributionBarProps) {
  const order: RiskLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const data = order.map((level) => ({ level, count: counts?.[level] ?? 0 }));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-slate-500 text-sm py-10 text-center">
        No scored transactions yet.
      </p>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <XAxis
            dataKey="level"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
            contentStyle={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#e2e8f0',
              fontSize: 13,
            }}
          />
          <Bar dataKey="count" name="Transactions" radius={[6, 6, 0, 0]} maxBarSize={64}>
            {data.map((entry) => (
              <Cell key={entry.level} fill={LEVEL_COLORS[entry.level]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
