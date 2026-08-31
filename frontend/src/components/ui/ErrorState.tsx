import { AlertTriangle, RotateCw } from 'lucide-react';

import Button from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-full bg-risk-critical/10 border border-risk-critical/25 flex items-center justify-center mb-4">
        <AlertTriangle size={26} className="text-risk-critical" />
      </div>
      <p className="text-slate-100 font-semibold">Something went wrong</p>
      <p className="text-slate-500 text-sm mt-1.5 max-w-sm leading-relaxed">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCw size={13} /> Retry
        </Button>
      )}
    </div>
  );
}
