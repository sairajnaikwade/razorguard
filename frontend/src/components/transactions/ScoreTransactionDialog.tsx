import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CreditCard,
  FlaskConical,
  Globe,
  History,
  Laptop,
  ShieldAlert,
  ShieldCheck,
  Store,
  User,
  X,
  Zap,
} from 'lucide-react';

import { transactionsApi, type ScoreRequest, type ScoreResponse } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import Badge, { decisionVariant, riskLevelVariant } from '../ui/Badge';
import Button from '../ui/Button';
import RiskSignalsList from './RiskSignalsList';
import Spinner from '../ui/Spinner';

interface ScoreTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  onScored: (result: ScoreResponse) => void;
}

// ─── Shared field styles ─────────────────────────────────────────────────────
const inputCls =
  'w-full bg-[#040C18]/90 border border-[#1A2A45] rounded-xl px-3.5 py-2.5 text-sm text-white ' +
  'placeholder:text-slate-700 focus:outline-none focus:border-blue-500/70 focus:ring-2 ' +
  'focus:ring-blue-500/15 transition-all duration-150 hover:border-[#2A3A55] h-10';

const selectCls =
  'w-full bg-[#040C18]/90 border border-[#1A2A45] rounded-xl px-3.5 py-2.5 text-sm text-white ' +
  'focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 ' +
  'transition-all duration-150 hover:border-[#2A3A55] h-10 cursor-pointer appearance-none ' +
  'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23475569\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")] ' +
  'bg-no-repeat bg-[right_12px_center]';

const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5';

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string; // tailwind color class for dot
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`w-1 h-4 rounded-full ${accent}`} />
      <span className={`opacity-60 ${accent.replace('bg-', 'text-')}`}>{icon}</span>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
    </div>
  );
}

// ─── Animated probability counter ────────────────────────────────────────────
function AnimatedProbability({ target }: { target: number }) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const duration = 1200;

  useEffect(() => {
    startRef.current = null;
    const animate = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return <>{displayed}</>;
}

// ─── Result probability ring ─────────────────────────────────────────────────
function ProbabilityRing({ probability, riskLevel }: { probability: number; riskLevel: string }) {
  const pct = Math.round(probability * 100);
  const colour =
    riskLevel === 'CRITICAL' ? '#EF4444'
    : riskLevel === 'HIGH'   ? '#F97316'
    : riskLevel === 'MEDIUM' ? '#EAB308'
    : '#22C55E';

  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36 flex items-center justify-center">
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-20"
          style={{ background: colour }}
        />
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Track */}
          <circle cx="60" cy="60" r={r} fill="none" stroke="#1A2A45" strokeWidth="8" />
          {/* Fill — animated via CSS transition */}
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{
              transition: 'stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.15s',
              filter: `drop-shadow(0 0 6px ${colour}88)`,
            }}
          />
        </svg>
        {/* Center */}
        <div className="relative z-10 text-center">
          <p className="text-3xl font-black tabular-nums leading-none" style={{ color: colour }}>
            <AnimatedProbability target={pct} />
            <span className="text-lg">%</span>
          </p>
          <p className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">Fraud Prob.</p>
        </div>
      </div>
      <p className="text-xs font-bold" style={{ color: colour }}>
        {riskLevel === 'CRITICAL' ? '⚠ CRITICAL RISK'
         : riskLevel === 'HIGH'   ? '▲ HIGH RISK'
         : riskLevel === 'MEDIUM' ? '◆ MODERATE RISK'
         : '✓ LOW RISK'}
      </p>
    </div>
  );
}

// ─── Example payload factory ──────────────────────────────────────────────────
function examplePayload(): ScoreRequest {
  return {
    transaction_id: `TXN_${Date.now().toString(36).toUpperCase()}`,
    customer_id: 'CUST_0042',
    merchant_id: 'MERCH_0010',
    amount: 240000,
    currency: 'INR',
    timestamp: new Date().toISOString(),
    payment_method: 'card',
    device_id: 'DEV_NEW_IP_XYZ',
    country: 'US',
    ip_region: 'REG_12',
    customer_account_age: 45,
    historical_transaction_count: 12,
    historical_failure_count: 0,
    failed_attempts: 3,
    new_device: 1,
    unusual_country: 1,
    payment_method_change: 1,
  };
}

// ─── Main dialog ─────────────────────────────────────────────────────────────
export default function ScoreTransactionDialog({
  open,
  onClose,
  onScored,
}: ScoreTransactionDialogProps) {
  const role = useAuthStore((s) => s.user?.role);
  const canScore = role === 'ADMIN' || role === 'ANALYST';

  const [payload, setPayload] = useState<ScoreRequest>(() => examplePayload());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResponse | null>(null);
  // Brief "analyzing" overlay shown right after submit before result renders
  const [analyzing, setAnalyzing] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setAnalyzing(false);
      setPayload(examplePayload());
    }
  }, [open]);

  // Trap focus & close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !canScore) return null;

  const set = (patch: Partial<ScoreRequest>) =>
    setPayload((p) => ({ ...p, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setAnalyzing(true);
    try {
      const response = await transactionsApi.score(payload);
      // Hold the "analyzing" state briefly for UX
      await new Promise((r) => setTimeout(r, 600));
      setAnalyzing(false);
      setResult(response);
      onScored(response);
    } catch (err: unknown) {
      setAnalyzing(false);
      interface FastApiValidationError { loc: string[]; msg: string; type: string }
      interface ApiErr { response?: { data?: { detail?: string | FastApiValidationError[] } } }
      const raw = (err as ApiErr).response?.data?.detail;
      let message: string;
      if (Array.isArray(raw)) {
        // FastAPI 422: detail is an array of {loc, msg, type} objects
        message = raw.map((e) => e.msg).join('; ');
      } else if (typeof raw === 'string') {
        message = raw;
      } else {
        message = 'Failed to score the transaction. The ML model may be unavailable.';
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Reusable field builders ────────────────────────────────────────────
  const textField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { mono?: boolean; required?: boolean; maxLength?: number; upper?: boolean; placeholder?: string },
  ) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        className={`${inputCls}${opts?.mono ? ' font-mono text-xs' : ''}`}
        value={value}
        required={opts?.required}
        maxLength={opts?.maxLength}
        placeholder={opts?.placeholder}
        onChange={(e) => onChange(opts?.upper ? e.target.value.toUpperCase() : e.target.value)}
      />
    </div>
  );

  const numField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts?: { min?: number; step?: number; placeholder?: string },
  ) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        min={opts?.min ?? 0}
        step={opts?.step ?? 1}
        className={inputCls}
        value={value}
        placeholder={opts?.placeholder}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );

  const flagField = (
    label: string,
    value: 0 | 1,
    onChange: (v: 0 | 1) => void,
  ) => (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        className={selectCls}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as 0 | 1)}
      >
        <option value={0}>No</option>
        <option value={1}>Yes — flagged</option>
      </select>
    </div>
  );

  // ─── Analyzing overlay ───────────────────────────────────────────────────
  if (analyzing) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Analyzing transaction"
      >
        <div className="modal-panel w-full max-w-sm text-center glass-card rounded-2xl p-10 shadow-2xl border-blue-500/20">
          {/* Pulse rings */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/30 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-blue-400/40 animate-ping" style={{ animationDelay: '0.15s' }} />
            <div className="w-full h-full rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
              <FlaskConical size={28} className="text-blue-400" />
            </div>
          </div>
          <p className="text-white font-bold text-sm">RazorGuard ML is analyzing this transaction</p>
          <p className="text-slate-500 text-xs mt-2">Evaluating 25 risk features…</p>
          <div className="mt-5 flex justify-center gap-1.5">
            {[0, 0.15, 0.3].map((d) => (
              <div
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Score transaction"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel — full height on mobile, constrained on desktop */}
      <div className="modal-panel w-full sm:max-w-2xl flex flex-col max-h-screen sm:max-h-[92vh] glass-card sm:rounded-2xl rounded-t-2xl shadow-2xl shadow-black/70 border border-blue-500/15">

        {/* ── Sticky header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1A2A45]/90 bg-[#081220]/98 backdrop-blur-sm rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/35 flex items-center justify-center shrink-0">
              <FlaskConical size={15} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-tight">Score Transaction</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">Evaluate risk using RazorGuard ML</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-2 rounded-xl hover:bg-white/8 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {result ? (
            /* ══════════════════════════════════════════════════════════
               RESULT VIEW
               ══════════════════════════════════════════════════════════ */
            <div className="p-5 sm:p-6 space-y-5 animate-fade-in">

              {/* Probability ring hero */}
              <div className="flex flex-col items-center py-2">
                <ProbabilityRing probability={result.fraud_probability} riskLevel={result.risk_level} />
              </div>

              {/* Risk + Decision tiles */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#050D1A]/70 border border-[#1A2A45] rounded-xl p-4 text-center">
                  <p className="section-label mb-2">Risk Level</p>
                  <Badge variant={riskLevelVariant(result.risk_level)} className="px-3 py-1 text-xs">
                    {result.risk_level}
                  </Badge>
                </div>
                <div className="bg-[#050D1A]/70 border border-[#1A2A45] rounded-xl p-4 text-center">
                  <p className="section-label mb-2">Decision</p>
                  <Badge variant={decisionVariant(result.decision)} className="px-3 py-1 text-xs">
                    {result.decision}
                  </Badge>
                </div>
              </div>

              {/* Threshold bar */}
              <div className="bg-[#050D1A]/70 border border-[#1A2A45] rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span>Fraud Probability</span>
                  <span className="font-mono">
                    Threshold: {(result.threshold * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-[#1A2A45] overflow-hidden relative">
                  {/* Threshold marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/40 z-10"
                    style={{ left: `${result.threshold * 100}%` }}
                  />
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${result.fraud_probability * 100}%`,
                      background:
                        result.risk_level === 'CRITICAL' ? '#EF4444'
                        : result.risk_level === 'HIGH' ? '#F97316'
                        : result.risk_level === 'MEDIUM' ? '#EAB308'
                        : '#22C55E',
                      transition: 'width 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.2s',
                    }}
                  />
                </div>
              </div>

              {/* Risk signals */}
              {result.risk_signals.length > 0 && (
                <div className="bg-[#050D1A]/70 border border-[#1A2A45] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert size={13} className="text-risk-high" />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Risk Signals
                      <span className="ml-2 px-1.5 py-0.5 rounded-md bg-risk-high/15 text-risk-high border border-risk-high/30">
                        {result.risk_signals.length}
                      </span>
                    </p>
                  </div>
                  <RiskSignalsList signals={result.risk_signals} />
                </div>
              )}

              {/* Model footer */}
              <div className="flex items-center gap-3 text-xs text-slate-600 font-mono border-t border-[#1A2A45]/70 pt-3">
                <ShieldCheck size={12} className="text-slate-600 shrink-0" />
                <span>
                  Model: <span className="text-slate-500">{result.model_version}</span>
                  <span className="mx-2 text-slate-700">·</span>
                  Threshold: <span className="text-slate-500">{result.threshold}</span>
                </span>
              </div>
            </div>

          ) : (
            /* ══════════════════════════════════════════════════════════
               FORM VIEW
               ══════════════════════════════════════════════════════════ */
            <form id="score-form" onSubmit={handleSubmit} noValidate className="p-5 sm:p-6 space-y-6">

              {/* ── SECTION 1: Transaction Identity ──────────────────── */}
              <section>
                <SectionHeader icon={<User size={13} />} title="Transaction Identity" accent="bg-blue-500" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {textField('Transaction ID', payload.transaction_id, (v) => set({ transaction_id: v }), { mono: true, required: true })}
                  {textField('Customer ID', payload.customer_id, (v) => set({ customer_id: v }), { mono: true, required: true, placeholder: 'CUST_0042' })}
                  {textField('Merchant ID', payload.merchant_id, (v) => set({ merchant_id: v }), { mono: true, required: true, placeholder: 'MERCH_0010' })}
                  <div>
                    <label className={labelCls}>Timestamp (ISO 8601)</label>
                    <input
                      className={`${inputCls} font-mono text-[11px]`}
                      value={payload.timestamp}
                      required
                      onChange={(e) => set({ timestamp: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              {/* Divider */}
              <div className="border-t border-[#1A2A45]/60" />

              {/* ── SECTION 2: Payment Details ────────────────────────── */}
              <section>
                <SectionHeader icon={<CreditCard size={13} />} title="Payment Details" accent="bg-cyan-500" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Amount — full width on mobile, left col on desktop */}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Amount (INR)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold pointer-events-none">₹</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        required
                        className={`${inputCls} pl-8 tabular-nums`}
                        value={payload.amount}
                        onChange={(e) => set({ amount: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Payment Method</label>
                    <select
                      className={selectCls}
                      value={payload.payment_method}
                      onChange={(e) => set({ payment_method: e.target.value })}
                    >
                      <option value="card">Card</option>
                      <option value="upi">UPI</option>
                      <option value="netbanking">Net Banking</option>
                    </select>
                  </div>

                  {textField('Device ID', payload.device_id, (v) => set({ device_id: v }), { mono: true, required: true, placeholder: 'DEV_NEW_IP_XYZ' })}

                  <div className="grid grid-cols-2 gap-2">
                    {textField('Country Code', payload.country, (v) => set({ country: v }), { required: true, maxLength: 2, upper: true, placeholder: 'US' })}
                    {textField('IP Region', payload.ip_region, (v) => set({ ip_region: v }), { required: true, placeholder: 'REG_12' })}
                  </div>

                  <div>
                    <label className={labelCls}>Currency</label>
                    <select
                      className={selectCls}
                      value={payload.currency}
                      onChange={(e) => set({ currency: e.target.value })}
                    >
                      <option value="INR">INR — Indian Rupee</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="GBP">GBP — British Pound</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Divider */}
              <div className="border-t border-[#1A2A45]/60" />

              {/* ── SECTION 3: Customer History & Risk Signals ────────── */}
              <section>
                <SectionHeader icon={<History size={13} />} title="Customer History & Risk Signals" accent="bg-violet-500" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {numField('Account Age (days)', payload.customer_account_age, (v) => set({ customer_account_age: v }), { placeholder: '45' })}
                  {numField('Historical Txns', payload.historical_transaction_count, (v) => set({ historical_transaction_count: v }), { placeholder: '12' })}
                  {numField('Historical Failures', payload.historical_failure_count, (v) => set({ historical_failure_count: v }), { placeholder: '0' })}
                  {numField('Failed Attempts', payload.failed_attempts, (v) => set({ failed_attempts: v }), { placeholder: '3' })}
                </div>

                {/* Risk flags — distinct visual treatment */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="section-label mb-2 flex items-center gap-1.5">
                      <Laptop size={11} />
                      New Device
                    </p>
                    {flagField('New Device', payload.new_device, (v) => set({ new_device: v }))}
                  </div>
                  <div>
                    <p className="section-label mb-2 flex items-center gap-1.5">
                      <Globe size={11} />
                      Unusual Country
                    </p>
                    {flagField('Unusual Country', payload.unusual_country, (v) => set({ unusual_country: v }))}
                  </div>
                  <div>
                    <p className="section-label mb-2 flex items-center gap-1.5">
                      <Store size={11} />
                      Payment Method Changed
                    </p>
                    {flagField('Method Changed', payload.payment_method_change, (v) => set({ payment_method_change: v }))}
                  </div>
                </div>

                {/* Risk flag visual indicators */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {payload.new_device === 1 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-risk-high/15 border border-risk-high/30 text-risk-high text-xs font-semibold">
                      <Zap size={10} /> New Device
                    </span>
                  )}
                  {payload.unusual_country === 1 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-risk-high/15 border border-risk-high/30 text-risk-high text-xs font-semibold">
                      <Globe size={10} /> Unusual Country
                    </span>
                  )}
                  {payload.payment_method_change === 1 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-risk-medium/15 border border-risk-medium/30 text-risk-medium text-xs font-semibold">
                      <CreditCard size={10} /> Method Changed
                    </span>
                  )}
                </div>
              </section>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm animate-fade-in">
                  <ShieldAlert size={15} className="shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Spacer so sticky footer doesn't overlap last field */}
              <div className="h-2" />
            </form>
          )}
        </div>

        {/* ── Sticky footer ────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-[#1A2A45]/90 bg-[#081220]/98 backdrop-blur-sm rounded-b-2xl">
          {result ? (
            <>
              <Link
                to={`/transactions/${encodeURIComponent(result.transaction_id)}`}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors font-semibold"
              >
                Open Investigation <ArrowRight size={13} />
              </Link>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                Cancel
              </Button>
              <button
                form="score-form"
                type="submit"
                disabled={submitting}
                className={`
                  inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                  transition-all duration-150 border focus:outline-none focus:ring-2 focus:ring-blue-500/40
                  focus:ring-offset-1 focus:ring-offset-[#081220] disabled:opacity-50 disabled:cursor-not-allowed
                  ${submitting
                    ? 'bg-blue-700/80 text-blue-200 border-blue-600/40'
                    : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white border-blue-500/40 shadow-md shadow-blue-700/25 hover:shadow-blue-500/30'
                  }
                `}
              >
                {submitting ? (
                  <><Spinner size={13} /> Scoring…</>
                ) : (
                  <>Run Scoring <ArrowRight size={13} /></>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
