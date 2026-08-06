import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type AccountSubpageHeaderProps = {
  title: string;
  description: string;
};

export function AccountSubpageHeader({
  title,
  description,
}: AccountSubpageHeaderProps) {
  return (
    <header className="space-y-3">
      <Link
        href="/me"
        aria-label="返回我的账户"
        className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </header>
  );
}
