import { Cell, PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts';
import type { RiskLevel } from '../../services/api';

const LEVEL_COLORS: Record<RiskLevel, string> = {
  CRITICAL: '#EF4444',
  HIGH:     '#F97316',
  MEDIUM:   '#EAB308',
  LOW:      '#10B981',
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
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={800}
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
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
      <p className="text-slate-500 text-sm py-12 text-center font-medium">
        No scored transactions recorded.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Donut chart */}
      <div className="h-52 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              dataKey="count"
              nameKey="level"
              paddingAngle={3}
              startAngle={90}
              endAngle={-270}
              labelLine={false}
              label={CustomLabel as unknown as boolean}
              animationBegin={150}
              animationDuration={800}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.level}
                  fill={entry.color}
                  stroke="#0A1628"
                  strokeWidth={2}
                  style={{ filter: `drop-shadow(0 0 6px ${entry.color}35)` }}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#0B1728',
                border: '1px solid #1E3A5F',
                borderRadius: 12,
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                color: '#F8FAFC',
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 12px',
              }}
              formatter={(value, name) => [
                `${(typeof value === 'number' ? value : 0).toLocaleString('en-IN')} transactions (${(((typeof value === 'number' ? value : 0) / total) * 100).toFixed(1)}%)`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white tracking-tight tabular-nums drop-shadow-[0_0_12px_rgba(59,130,246,0.3)]">
            {total.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Total Scored
          </span>
        </div>
      </div>

      {/* Legend rows */}
      <div className="space-y-2.5 pt-1">
        {data.map((d) => {
          const pct = total > 0 ? (d.count / total) * 100 : 0;
          return (
            <div key={d.level} className="flex items-center gap-2.5 text-xs font-medium">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                style={{ background: d.color, boxShadow: `0 0 6px ${d.color}60` }}
              />
              <span className="text-slate-300 w-16 shrink-0 font-semibold">{d.level}</span>
              {/* Progress bar */}
              <div className="flex-1 h-2 rounded-full bg-[#0E1F38] overflow-hidden border border-[#162A45]/40 p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${d.color}, ${d.color}DD)`,
                  }}
                />
              </div>
              <span
                className="font-bold tabular-nums w-12 text-right shrink-0"
                style={{ color: d.color }}
              >
                {d.count.toLocaleString('en-IN')}
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums w-11 text-right shrink-0 font-semibold">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
