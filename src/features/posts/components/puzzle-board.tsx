"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { Discount } from "../domain/types";

const pieceCountByDiscount = {
  95: 4,
  90: 6,
  80: 9,
} as const satisfies Record<Discount, number>;

const discountLabel = {
  95: "95折",
  90: "9折",
  80: "8折",
} as const satisfies Record<Discount, string>;

type PuzzleBoardProps = {
  discount: Discount;
  value: number | null;
  onChange: (pieceNumber: number) => void;
};

export function PuzzleBoard({ discount, value, onChange }: PuzzleBoardProps) {
  const reduceMotion = useReducedMotion();
  const count = pieceCountByDiscount[discount];
  const columns = discount === 95 ? 2 : 3;

  return (
    <div
      role="radiogroup"
      aria-label={`${discountLabel[discount]}拼图选择`}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, index) => {
        const pieceNumber = index + 1;
        const selected = value === pieceNumber;

        return (
          <motion.button
            key={pieceNumber}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${discountLabel[discount]}${pieceNumber}号拼图`}
            onClick={() => onChange(pieceNumber)}
            animate={
              reduceMotion
                ? { scale: 1, y: 0 }
                : { scale: selected ? 1.03 : 1, y: selected ? -2 : 0 }
            }
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            className={`aspect-square rounded-2xl border text-sm font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
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
