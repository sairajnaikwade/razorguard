import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center animate-fade-in">
      <div className="text-slate-600 mb-4 opacity-70">{icon ?? <Inbox size={38} />}</div>
      <p className="text-slate-300 font-semibold text-sm">{title}</p>
      {description && (
        <p className="text-slate-500 text-sm mt-1.5 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
