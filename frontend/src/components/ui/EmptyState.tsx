import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-slate-600 mb-3">{icon ?? <Inbox size={36} />}</div>
      <p className="text-slate-300 font-medium">{title}</p>
      {description && <p className="text-slate-500 text-sm mt-1 max-w-sm">{description}</p>}
    </div>
  );
}
