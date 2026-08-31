import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';

import { investigateApi, type AIInvestigationReport } from '../../services/api';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

// ─── Action config ────────────────────────────────────────────────────────────
function actionConfig(action: string): {
  label: string;
  colour: string;
  border: string;
  bg: string;
} {
  switch (action.toUpperCase()) {
    case 'ALLOW':
      return { label: 'ALLOW', colour: 'text-risk-low', border: 'border-risk-low/30', bg: 'bg-risk-low/8' };
    case 'MONITOR':
      return { label: 'MONITOR', colour: 'text-risk-medium', border: 'border-risk-medium/30', bg: 'bg-risk-medium/8' };
    case 'REQUEST_VERIFICATION':
      return { label: 'REQUEST VERIFICATION', colour: 'text-risk-high', border: 'border-risk-high/30', bg: 'bg-risk-high/8' };
    case 'ESCALATE':
      return { label: 'ESCALATE', colour: 'text-risk-critical', border: 'border-risk-critical/40', bg: 'bg-risk-critical/8' };
    default:
      return { label: action, colour: 'text-slate-300', border: 'border-[#142238]', bg: 'bg-white/3' };
  }
}

// ─── Section heading inside report ───────────────────────────────────────────
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-[#142238] last:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</p>
      {children}
    </div>
  );
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const barClass = pct >= 80 ? 'bg-risk-low' : pct >= 55 ? 'bg-risk-medium' : 'bg-risk-high';
  const label    = pct >= 80 ? 'High' : pct >= 55 ? 'Moderate' : 'Low';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-[#142238] overflow-hidden">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums text-slate-200 w-9 text-right">{pct}%</span>
      </div>
      <p className="text-xs text-slate-500">{label} confidence</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface AiInvestigationPanelProps {
  transactionId: string;
  canGenerate: boolean;
}

export default function AiInvestigationPanel({ transactionId, canGenerate }: AiInvestigationPanelProps) {
  const [report, setReport]                     = useState<AIInvestigationReport | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [generating, setGenerating]             = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [notFound, setNotFound]                 = useState(false);
  const [limitationsOpen, setLimitationsOpen]   = useState(false);

  const loadExisting = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true); setError(null); setNotFound(false);
    try {
      setReport(await investigateApi.fetch(transactionId));
    } catch (err: unknown) {
      interface ApiErr { response?: { status?: number } }
      if ((err as ApiErr).response?.status === 404) setNotFound(true);
      else setError('Failed to load the AI investigation report.');
    } finally { setLoading(false); }
  }, [transactionId]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const handleGenerate = useCallback(async (regenerate = false) => {
    if (!canGenerate) return;
    setGenerating(true); setError(null);
    try {
      const data = await investigateApi.generate(transactionId, regenerate);
      setReport(data); setNotFound(false);
    } catch (err: unknown) {
      interface ApiErr { response?: { data?: { detail?: string } } }
      setError((err as ApiErr).response?.data?.detail ?? 'Failed to generate AI investigation report.');
    } finally { setGenerating(false); }
  }, [transactionId, canGenerate]);

  const cfg = report ? actionConfig(report.recommended_action) : null;

  return (
    <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#142238]">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-primary shrink-0" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI Investigation Report</h2>
        </div>
        {report && canGenerate && (
          <Button id="ai-regenerate-btn" variant="ghost" size="sm" disabled={generating}
            onClick={() => void handleGenerate(true)} title="Force regeneration from Gemini"
          >
            <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
            Regenerate
          </Button>
        )}
      </div>

      <div className="px-4 py-3">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Spinner size={24} />
            <p className="text-slate-500 text-sm">Loading report…</p>
          </div>
        )}

        {/* No report */}
        {!loading && notFound && (
          <div className="py-4 text-center space-y-3">
            <CircleDashed size={20} className="mx-auto text-slate-600" />
            <div>
              <p className="text-slate-300 text-sm font-medium">No AI investigation yet</p>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                {canGenerate ? 'Run a Gemini-powered analysis on this transaction.' : 'Contact an analyst to generate the investigation report.'}
              </p>
            </div>
            {canGenerate && (
              <Button id="ai-generate-btn" variant="primary" size="sm" disabled={generating}
                onClick={() => void handleGenerate(false)}
              >
                {generating ? <><Spinner size={12} /> Generating…</> : <><Sparkles size={12} /> Run AI Investigation</>}
              </Button>
            )}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="border border-risk-critical/30 bg-risk-critical/5 rounded px-3 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5 text-risk-critical" />
              <p className="text-risk-critical text-sm leading-relaxed">{error}</p>
            </div>
            {canGenerate && (
              <Button id="ai-retry-btn" variant="ghost" size="sm" onClick={() => void handleGenerate(false)} disabled={generating}>
                <RefreshCw size={11} /> Retry
              </Button>
            )}
          </div>
        )}

        {/* Report */}
        {!loading && report && (
          <div className="animate-fade-in">

            {/* Source indicator */}
            <div className={`flex items-center gap-2 rounded px-3 py-2 mb-3 border text-xs ${
              report.is_mock
                ? 'bg-white/[0.02] border-[#142238] text-slate-400'
                : 'bg-primary/5 border-primary/20 text-primary/80'
            }`}>
              {report.is_mock
                ? <><WifiOff size={11} className="shrink-0" /><span><span className="font-semibold text-slate-300">Mock mode</span> — no Gemini API key. Deterministic response.</span></>
                : <><ShieldCheck size={11} className="shrink-0" /><span>Powered by Gemini · grounded on transaction, history and audit data only.</span></>
              }
            </div>

            {/* Recommended Action */}
            {cfg && (
              <div className={`rounded px-3 py-2.5 mb-3 border ${cfg.bg} ${cfg.border}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Recommended Action</p>
                <p className={`text-base font-bold tracking-wide ${cfg.colour}`}>
                  {cfg.label}
                </p>
                {report.recommended_action.toUpperCase() === 'ESCALATE' && (
                  <p className="text-xs text-risk-critical/80 mt-1 leading-relaxed">
                    Requires immediate escalation to the fraud operations team.
                  </p>
                )}
              </div>
            )}

            {/* Summary */}
            <ReportSection title="Summary">
              <p className="text-sm text-slate-200 leading-relaxed">{report.summary}</p>
            </ReportSection>

            {/* Key Evidence */}
            <ReportSection title="Key Evidence">
              <ul className="space-y-1.5">
                {report.key_evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-primary/70" />
                    <span className="text-sm text-slate-300 leading-relaxed">{e}</span>
                  </li>
                ))}
              </ul>
            </ReportSection>

            {/* Risk Reasoning */}
            <ReportSection title="Risk Reasoning">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{report.risk_reasoning}</p>
            </ReportSection>

            {/* AI Confidence */}
            <ReportSection title="AI Confidence">
              <ConfidenceBar value={report.confidence} />
            </ReportSection>

            {/* Limitations — collapsible */}
            {report.limitations.length > 0 && (
              <div className="pt-3">
                <button
                  id="ai-limitations-toggle"
                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-400 transition-colors w-full text-left"
                  onClick={() => setLimitationsOpen((o) => !o)}
                  aria-expanded={limitationsOpen}
                >
                  {limitationsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  Limitations &amp; Caveats ({report.limitations.length})
                </button>
                {limitationsOpen && (
                  <ul className="mt-2 space-y-1.5 animate-fade-in">
                    {report.limitations.map((l, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
                        <AlertTriangle size={10} className="shrink-0 mt-0.5 text-slate-600" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Generating indicator */}
            {generating && (
              <div className="flex items-center gap-2 pt-3 text-xs text-slate-500 border-t border-[#142238] mt-3">
                <Spinner size={11} /> Requesting AI analysis from Gemini…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
