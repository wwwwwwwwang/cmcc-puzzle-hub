import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center"
    >
      <span className="mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}
