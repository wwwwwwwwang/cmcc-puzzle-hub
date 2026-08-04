"use client";

import { House, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "大厅", icon: House },
  { href: "/publish", label: "发布", icon: Plus },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主要导航"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="grid h-16 grid-cols-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                active ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
