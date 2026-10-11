"use client";

import type { Discount } from "../domain/types";
import {
  getPuzzleColumns,
  puzzleDiscountLabels,
  puzzlePieceCounts,
  usePuzzleGridNavigation,
} from "./puzzle-grid";

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
  const count = puzzlePieceCounts[discount];
  const columns = getPuzzleColumns(discount);
  const rows = count / columns;
  const { refs, handleKeyDown } = usePuzzleGridNavigation({
    count,
    onChange,
  });

  return (
    <div
      role="radiogroup"
      aria-label={`${puzzleDiscountLabels[discount]}拼图选择`}
      className="grid size-[270px] max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm"
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
            aria-label={`${puzzleDiscountLabels[discount]}${pieceNumber}号拼图`}
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
