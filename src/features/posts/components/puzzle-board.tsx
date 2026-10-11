"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

import type { Discount } from "../domain/types";
import {
  getPuzzleColumns,
  puzzleDiscountLabels,
  puzzlePieceCounts,
  usePuzzleGridNavigation,
} from "./puzzle-grid";

type PuzzleBoardProps = {
  discount: Discount;
  value: number | null;
  onChange: (pieceNumber: number | null) => void;
  disabled?: boolean;
};

export function PuzzleBoard({
  discount,
  value,
  onChange,
  disabled = false,
}: PuzzleBoardProps) {
  const reduceMotion = useReducedMotion();
  const count = puzzlePieceCounts[discount];
  const columns = getPuzzleColumns(discount);
  const previousDiscount = useRef(discount);
  const { refs: pieceRefs, handleKeyDown } = usePuzzleGridNavigation({
    count,
    onChange,
    disabled,
  });

  useEffect(() => {
    if (previousDiscount.current !== discount) {
      previousDiscount.current = discount;
      onChange(null);
    }
  }, [discount, onChange]);

  return (
    <div
      role="radiogroup"
      aria-label={`${puzzleDiscountLabels[discount]}拼图选择`}
      aria-disabled={disabled}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, index) => {
        const pieceNumber = index + 1;
        const selected = value === pieceNumber;

        return (
          <motion.button
            key={pieceNumber}
            ref={(element) => {
              pieceRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${puzzleDiscountLabels[discount]}${pieceNumber}号拼图`}
            disabled={disabled}
            tabIndex={
              disabled
                ? -1
                : selected || (value === null && pieceNumber === 1)
                  ? 0
                  : -1
            }
            onClick={() => {
              if (!disabled) onChange(pieceNumber);
            }}
            onKeyDown={(event) => {
              if (handleKeyDown(event.key, pieceNumber)) event.preventDefault();
            }}
            animate={
              reduceMotion
                ? undefined
                : { scale: selected ? 1.03 : 1, y: selected ? -2 : 0 }
            }
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            transition={reduceMotion ? undefined : { duration: 0.16 }}
            className={`aspect-square rounded-lg border text-sm font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none ${
              selected
                ? "border-blue-500 bg-blue-600 text-white shadow-blue-200"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            <span className="block text-2xl font-bold">{pieceNumber}</span>
            <span className="mt-1 block text-xs opacity-80">号拼图</span>
          </motion.button>
        );
      })}
    </div>
  );
}
