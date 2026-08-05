"use client";

import { MousePointer2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Discount, PostType } from "../domain/types";
import { HallPuzzleBoard } from "./hall-puzzle-board";

type PostFiltersProps = {
  discount: Discount;
  type?: PostType;
  pieceNumber: number | null;
};

const discounts = [
  { value: 95 as const, label: "95折(4块)" },
  { value: 90 as const, label: "9折(6块)" },
  { value: 80 as const, label: "8折(9块)" },
];

const types = [
  { value: undefined, label: "全部分类" },
  { value: "GIVE" as const, label: "只看赠送" },
  { value: "REQUEST" as const, label: "只看求助" },
];

const gridNames = { 95: "四宫格", 90: "六宫格", 80: "九宫格" } as const;

export function PostFilters({ discount, type, pieceNumber }: PostFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    params.delete("cursor");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2.5" aria-label="大厅筛选">
        <div className="flex rounded-[10px] bg-slate-100 p-1">
          {discounts.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={discount === option.value}
              onClick={() =>
                navigate((params) => {
                  params.set("discount", String(option.value));
                  params.delete("pieceNumber");
                })
              }
              className={`flex-1 rounded-lg px-1 py-2 text-sm font-medium transition ${
                discount === option.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex rounded-[10px] bg-slate-100 p-1">
          {types.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={type === option.value}
              onClick={() =>
                navigate((params) => {
                  if (option.value) params.set("type", option.value);
                  else params.delete("type");
                })
              }
              className={`flex-1 rounded-lg px-1 py-2 text-sm font-medium transition ${
                type === option.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center pb-4">
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-slate-500">
          <MousePointer2 className="size-3.5" aria-hidden="true" />
          点击下方{gridNames[discount]}，精准筛选所需拼图
        </p>
        <HallPuzzleBoard
          discount={discount}
          value={pieceNumber}
          onChange={(value) =>
            navigate((params) => {
              if (value === null) params.delete("pieceNumber");
              else params.set("pieceNumber", String(value));
            })
          }
        />
      </div>
    </div>
  );
}
