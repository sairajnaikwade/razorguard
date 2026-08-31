import { useEffect, useRef } from 'react';

const LEVEL_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH:     '#F97316',
  MEDIUM:   '#EAB308',
  LOW:      '#22C55E',
};

const LEVEL_LABELS: Record<string, string> = {
  CRITICAL: 'Very High Risk',
  HIGH:     'High Risk',
  MEDIUM:   'Moderate Risk',
  LOW:      'Low Risk',
};

interface ProbabilityGaugeProps {
  probability: number | null | undefined;
  riskLevel?: string | null;
}

// SVG arc gauge — no Recharts dependency, fully custom animated
export default function ProbabilityGauge({ probability, riskLevel }: ProbabilityGaugeProps) {
  const arcRef = useRef<SVGPathElement>(null);

  const isValid =
    probability !== null && probability !== undefined && !Number.isNaN(probability);

  const pct    = isValid ? Math.round(probability! * 100) : 0;
  const colour = LEVEL_COLORS[riskLevel ?? ''] ?? '#3B82F6';
  const label  = LEVEL_LABELS[riskLevel ?? ''] ?? 'Unscored';

  // Arc geometry
  const cx = 100, cy = 100, r = 76;
  const startAngle = 210; // degrees
  const sweepAngle = 300; // total sweep
  const fillAngle  = isValid ? (pct / 100) * sweepAngle : 0;

  function polarToXY(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(fromDeg: number, toDeg: number) {
    const s = polarToXY(fromDeg);
    const e = polarToXY(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const trackPath = arcPath(startAngle, startAngle + sweepAngle);
  const fillPath  = isValid ? arcPath(startAngle, startAngle + fillAngle) : '';

  // Animate arc length on mount/change via stroke-dasharray trick
  const circumference = 2 * Math.PI * r;
  const fillFraction  = isValid ? pct / 100 : 0;
  // Track arc length is sweepAngle/360 of full circumference
  const trackLen  = (sweepAngle / 360) * circumference;
  const fillLen   = fillFraction * trackLen;

  useEffect(() => {
    const el = arcRef.current;
    if (!el || !isValid) return;
    el.style.strokeDasharray  = `${fillLen} ${circumference}`;
    el.style.strokeDashoffset = '0';
  }, [fillLen, circumference, isValid]);

  if (!isValid) {
    return (
      <div className="h-44 flex items-center justify-center text-slate-500 text-sm">
        Not scored — no probability available.
      </div>
    );
  }

  // Tick marks
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div
      className="relative flex flex-col items-center"
      role="img"
      aria-label={`Fraud probability ${pct}%`}
    >
      <svg
        viewBox="0 0 200 160"
        className="w-full max-w-[220px]"
        style={{ overflow: 'visible' }}
      >
        {/* Outer glow filter */}
        <defs>
          <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="trackShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Track (background arc) */}
        <path
          d={trackPath}
          fill="none"
          stroke="#1e293b"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {ticks.map((tick) => {
          const angle = startAngle + (tick / 100) * sweepAngle;
          const inner = polarToXY(angle);
          // Adjust for outer tick
          const outerR = r + 10;
          const outerRad = ((angle - 90) * Math.PI) / 180;
          const outer = { x: cx + outerR * Math.cos(outerRad), y: cy + outerR * Math.sin(outerRad) };
          return (
            <line
              key={tick}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="rgba(100,116,139,0.4)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Fill arc — animated via CSS */}
        {isValid && (
          <path
            ref={arcRef}
            d={fillPath}
            fill="none"
            stroke={colour}
            strokeWidth="14"
            strokeLinecap="round"
            filter="url(#gaugeGlow)"
            style={{
              strokeDasharray: `0 ${circumference}`,
              transition: 'stroke-dasharray 1.1s cubic-bezier(0.34,1.56,0.64,1) 0.2s',
              strokeDashoffset: 0,
            }}
          />
        )}

        {/* Needle dot at fill end */}
        {isValid && fillAngle > 5 && (() => {
          const endPt = polarToXY(startAngle + fillAngle);
          return (
            <circle
              cx={endPt.x}
              cy={endPt.y}
              r="6"
              fill={colour}
              filter="url(#gaugeGlow)"
            />
          );
        })()}

        {/* Center value */}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          fill="white"
          fontSize="30"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          letterSpacing="-1"
        >
          {pct}%
        </text>
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="9"
          fontWeight="600"
          letterSpacing="1"
          textDecoration="none"
          style={{ textTransform: 'uppercase' }}
        >
          FRAUD PROB.
        </text>

        {/* Risk label */}
        <text
          x={cx} y={cy + 30}
          textAnchor="middle"
          fill={colour}
          fontSize="10"
          fontWeight="700"
          letterSpacing="0.5"
        >
          {label}
        </text>

        {/* 0% / 100% labels */}
        {(() => {
          const p0   = polarToXY(startAngle);
          const p100 = polarToXY(startAngle + sweepAngle);
          return (
            <>
              <text x={p0.x - 4}   y={p0.y + 16}   textAnchor="middle" fill="#475569" fontSize="8">0%</text>
              <text x={p100.x + 4} y={p100.y + 16}  textAnchor="middle" fill="#475569" fontSize="8">100%</text>
            </>
          );
        })()}
      </svg>

      {/* Colour-coded severity bar below gauge */}
      <div className="w-full max-w-[160px] mt-1">
        <div className="h-1.5 rounded-full overflow-hidden flex">
          <div className="flex-1 bg-risk-low/60"   />
          <div className="flex-1 bg-risk-medium/60" />
          <div className="flex-1 bg-risk-high/60"   />
          <div className="flex-1 bg-risk-critical/60" />
        </div>
        <div className="flex justify-between text-[9px] text-slate-600 mt-1 px-0.5">
          <span>LOW</span><span>MED</span><span>HIGH</span><span>CRIT</span>
        </div>
      </div>
    </div>
  );
}
