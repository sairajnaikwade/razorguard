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
  WifiOff,
} from 'lucide-react';

import { investigateApi, type AIInvestigationReport } from '../../services/api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

// ---------------------------------------------------------------------------
// Helper — map recommended_action to colour token
// ---------------------------------------------------------------------------
function actionColour(action: string): string {
  switch (action.toUpperCase()) {
    case 'ALLOW':
      return 'text-risk-low border-risk-low/40 bg-risk-low/10';
    case 'MONITOR':
      return 'text-risk-medium border-risk-medium/40 bg-risk-medium/10';
    case 'REQUEST_VERIFICATION':
      return 'text-risk-high border-risk-high/40 bg-risk-high/10';
    case 'ESCALATE':
      return 'text-risk-critical border-risk-critical/40 bg-risk-critical/10';
    default:
      return 'text-slate-300 border-slate-700 bg-slate-800/50';
  }
}

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const colour =
    pct >= 80
      ? 'bg-risk-low'
      : pct >= 55
      ? 'bg-risk-medium'
      : 'bg-risk-high';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums font-semibold text-slate-200 w-9 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence list item
// ---------------------------------------------------------------------------
function EvidenceItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" />
      <span>{text}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface AiInvestigationPanelProps {
  transactionId: string;
  /** ANALYST and ADMIN can generate; VIEWER can only read existing reports. */
  canGenerate: boolean;
}

export default function AiInvestigationPanel({
  transactionId,
  canGenerate,
}: AiInvestigationPanelProps) {
  const [report, setReport] = useState<AIInvestigationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [limitationsOpen, setLimitationsOpen] = useState(false);

  // On mount: try to load an existing cached report (all roles allowed)
  const loadExisting = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await investigateApi.fetch(transactionId);
      setReport(data);
    } catch (err: unknown) {
      interface ApiErr { response?: { status?: number } }
      if ((err as ApiErr).response?.status === 404) {
        setNotFound(true);
      } else {
        setError('Failed to load the AI investigation report.');
      }
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const handleGenerate = useCallback(
    async (regenerate = false) => {
      if (!canGenerate) return;
      setGenerating(true);
      setError(null);
      try {
        const data = await investigateApi.generate(transactionId, regenerate);
        setReport(data);
        setNotFound(false);
      } catch (err: unknown) {
        interface ApiErr { response?: { data?: { detail?: string } } }
        const detail = (err as ApiErr).response?.data?.detail;
        setError(detail ?? 'Failed to generate AI investigation report.');
      } finally {
        setGenerating(false);
      }
    },
    [transactionId, canGenerate],
  );

  // -------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------
  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bot size={16} className="text-primary" />
          AI Investigation Report
        </h2>
        {report && canGenerate && (
          <Button
            id="ai-regenerate-btn"
            variant="ghost"
            size="sm"
            disabled={generating}
            onClick={() => void handleGenerate(true)}
            title="Force regeneration from Gemini"
          >
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            Regenerate
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size={24} />
        </div>
      )}

      {/* No report yet */}
      {!loading && notFound && (
        <div className="text-center py-6 space-y-3">
          <CircleDashed size={32} className="mx-auto text-slate-600" />
          <p className="text-slate-400 text-sm">No AI investigation report yet.</p>
          {canGenerate ? (
            <Button
              id="ai-generate-btn"
              variant="primary"
              size="sm"
              disabled={generating}
              onClick={() => void handleGenerate(false)}
            >
              {generating ? (
                <>
                  <Spinner size={14} /> Generating…
                </>
              ) : (
                <>
                  <Bot size={14} /> Run AI Investigation
                </>
              )}
            </Button>
          ) : (
            <p className="text-slate-500 text-xs">
              Contact an analyst to generate the investigation report.
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-start gap-2 rounded-lg bg-risk-critical/10 border border-risk-critical/30 px-4 py-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-risk-critical" />
          <div className="space-y-2">
            <p className="text-risk-critical text-sm">{error}</p>
            {canGenerate && (
              <Button
                id="ai-retry-btn"
                variant="ghost"
                size="sm"
                onClick={() => void handleGenerate(false)}
                disabled={generating}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Report */}
      {!loading && report && (
        <div className="space-y-5">
          {/* Mock/offline banner */}
          {report.is_mock && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-800/80 border border-slate-700 px-3 py-2">
              <WifiOff size={13} className="shrink-0 text-slate-400" />
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Offline mock mode</span> — no
                Gemini API key configured. Report generated deterministically from model
                outputs; not a live AI response.
              </p>
            </div>
          )}
          {!report.is_mock && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/25 px-3 py-2">
              <ShieldCheck size={13} className="shrink-0 text-primary" />
              <p className="text-xs text-primary/80">
                Powered by Gemini — grounded on transaction, history and audit data only.
              </p>
            </div>
          )}

          {/* Summary */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Summary
            </p>
            <p className="text-sm text-slate-200 leading-relaxed">{report.summary}</p>
          </section>

          {/* Recommended Action */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Recommended Action
            </p>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-lg border text-sm font-bold tracking-wide ${actionColour(
                report.recommended_action,
              )}`}
            >
              {report.recommended_action}
            </span>
          </section>

          {/* Confidence */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              AI Confidence
            </p>
            <ConfidenceBar value={report.confidence} />
          </section>

          {/* Key Evidence */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Key Evidence
            </p>
            <ul className="space-y-1.5">
              {report.key_evidence.map((e, i) => (
                <EvidenceItem key={i} text={e} />
              ))}
            </ul>
          </section>

          {/* Risk Reasoning */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Risk Reasoning
            </p>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {report.risk_reasoning}
            </p>
          </section>

          {/* Limitations (collapsible) */}
          {report.limitations.length > 0 && (
            <section>
              <button
                id="ai-limitations-toggle"
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                onClick={() => setLimitationsOpen((o) => !o)}
                aria-expanded={limitationsOpen}
              >
                {limitationsOpen ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                Limitations &amp; Caveats ({report.limitations.length})
              </button>
              {limitationsOpen && (
                <ul className="mt-2 space-y-1.5">
                  {report.limitations.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
                      <AlertTriangle size={11} className="shrink-0 mt-0.5 text-slate-600" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Generating overlay */}
          {generating && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Spinner size={12} />
              Requesting AI analysis…
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
