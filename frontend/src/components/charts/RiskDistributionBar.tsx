import { Cell, PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts';
import type { RiskLevel } from '../../services/api';

const LEVEL_COLORS: Record<RiskLevel, string> = {
  CRITICAL: '#EF4444',
  HIGH:     '#F97316',
  MEDIUM:   '#EAB308',
  LOW:      '#22C55E',
};

const LEVEL_ORDER: RiskLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

interface RiskDistributionBarProps {
  counts: Record<RiskLevel, number>;
}

interface CustomLabelProps {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  midAngle: number;
  percent: number;
}

function CustomLabel({ cx, cy, innerRadius, outerRadius, midAngle, percent }: CustomLabelProps) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x} y={y}
      fill="rgba(255,255,255,0.85)"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

export default function RiskDistributionBar({ counts }: RiskDistributionBarProps) {
  const data = LEVEL_ORDER.map((level) => ({
    level,
    count: counts?.[level] ?? 0,
    color: LEVEL_COLORS[level],
  }));
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-slate-500 text-sm py-10 text-center">
        No scored transactions yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Donut chart */}
      <div className="h-48 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              dataKey="count"
              nameKey="level"
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              labelLine={false}
              label={CustomLabel as unknown as boolean}
              animationBegin={200}
              animationDuration={900}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.level}
                  fill={entry.color}
                  stroke="rgba(0,0,0,0.3)"
                  strokeWidth={1}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 10,
                color: '#e2e8f0',
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `${(typeof value === 'number' ? value : 0).toLocaleString('en-IN')} (${(((typeof value === 'number' ? value : 0) / total) * 100).toFixed(1)}%)`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white tabular-nums">
            {total.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
            Total
          </span>
        </div>
      </div>

      {/* Legend rows */}
      <div className="space-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? (d.count / total) * 100 : 0;
          return (
            <div key={d.level} className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-xs text-slate-400 w-16 shrink-0">{d.level}</span>
              {/* Mini bar */}
              <div className="flex-1 h-1.5 rounded-full bg-[#0F1F36] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: d.color,
                    opacity: 0.8,
                  }}
                />
              </div>
              <span
                className="text-xs font-bold tabular-nums w-14 text-right shrink-0"
                style={{ color: d.color }}
              >
                {d.count.toLocaleString('en-IN')}
              </span>
              <span className="text-[11px] text-slate-600 tabular-nums w-10 text-right shrink-0">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
