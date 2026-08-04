"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PostFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") ?? "";
  const discount = searchParams.get("discount") ?? "";

  function update(name: "type" | "discount", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete("cursor");
    router.replace(`${pathname}${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="grid grid-cols-2 gap-3" aria-label="筛选">
      <label className="text-sm text-slate-600">
        类型
        <select aria-label="类型筛选" className="mt-1 h-10 w-full rounded-lg border px-2" value={type} onChange={(event) => update("type", event.target.value)}>
          <option value="">全部</option>
          <option value="GIVE">赠送</option>
          <option value="REQUEST">求助</option>
        </select>
      </label>
      <label className="text-sm text-slate-600">
        折扣
        <select aria-label="折扣筛选" className="mt-1 h-10 w-full rounded-lg border px-2" value={discount} onChange={(event) => update("discount", event.target.value)}>
          <option value="">全部</option>
          <option value="95">95折</option>
          <option value="90">9折</option>
          <option value="80">8折</option>
        </select>
      </label>
    </div>
  );
}
