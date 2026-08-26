import { AlertTriangle, RotateCw } from 'lucide-react';

import Button from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-risk-critical/80 mb-3">
        <AlertTriangle size={36} />
      </div>
      <p className="text-slate-200 font-medium">Something went wrong</p>
      <p className="text-slate-500 text-sm mt-1 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw size={14} /> Retry
        </Button>
      )}
    </div>
  );
}
