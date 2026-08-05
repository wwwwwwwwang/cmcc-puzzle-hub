"use client";

import { useRef } from "react";

import type { Discount } from "../domain/types";

const counts = { 95: 4, 90: 6, 80: 9 } as const;
const labels = { 95: "95折", 90: "9折", 80: "8折" } as const;

type HallPuzzleBoardProps = {
  discount: Discount;
  value: number | null;
  onChange: (value: number | null) => void;
};

export function HallPuzzleBoard({
  discount,
  value,
  onChange,
}: HallPuzzleBoardProps) {
  const count = counts[discount];
  const columns = discount === 80 ? 3 : 2;
  const rows = count / columns;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectAndFocus(pieceNumber: number) {
    onChange(pieceNumber);
    refs.current[pieceNumber - 1]?.focus();
  }

  function handleKeyDown(key: string, pieceNumber: number) {
    if (key === "ArrowRight" || key === "ArrowDown") {
      selectAndFocus(pieceNumber === count ? 1 : pieceNumber + 1);
      return true;
    }
    if (key === "ArrowLeft" || key === "ArrowUp") {
      selectAndFocus(pieceNumber === 1 ? count : pieceNumber - 1);
      return true;
    }
    if (key === "Home") {
      selectAndFocus(1);
      return true;
    }
    if (key === "End") {
      selectAndFocus(count);
      return true;
    }
    return false;
  }

  return (
    <div
      role="radiogroup"
      aria-label={`${labels[discount]}拼图选择`}
      className="grid size-[270px] max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: count }, (_, index) => {
        const pieceNumber = index + 1;
        const selected = value === pieceNumber;
        return (
          <button
            key={pieceNumber}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${labels[discount]}${pieceNumber}号拼图`}
            tabIndex={selected || (value === null && pieceNumber === 1) ? 0 : -1}
            onClick={() => onChange(selected ? null : pieceNumber)}
            onKeyDown={(event) => {
              if (handleKeyDown(event.key, pieceNumber)) event.preventDefault();
            }}
            className={`border-b border-r border-slate-200 text-[28px] font-bold outline-none transition-[background-color,color,transform] active:scale-[0.98] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
              selected
                ? "bg-blue-50 text-blue-600 shadow-[inset_0_0_0_2px_#2563eb]"
                : "bg-white text-slate-400 hover:bg-slate-50"
            }`}
          >
            {pieceNumber}
          </button>
        );
      })}
    </div>
  );
}
