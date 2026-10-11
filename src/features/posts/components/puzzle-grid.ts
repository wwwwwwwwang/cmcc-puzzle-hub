import { useRef } from "react";

import type { Discount } from "../domain/types";

export const puzzlePieceCounts = {
  95: 4,
  90: 6,
  80: 9,
} as const satisfies Record<Discount, number>;

export const puzzleDiscountLabels = {
  95: "95折",
  90: "9折",
  80: "8折",
} as const satisfies Record<Discount, string>;

export function getPuzzleColumns(discount: Discount) {
  return discount === 80 ? 3 : 2;
}

export function usePuzzleGridNavigation({
  count,
  onChange,
  disabled = false,
}: {
  count: number;
  onChange: (pieceNumber: number) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectAndFocus(pieceNumber: number) {
    onChange(pieceNumber);
    refs.current[pieceNumber - 1]?.focus();
  }

  function handleKeyDown(key: string, pieceNumber: number) {
    if (disabled) return false;

    switch (key) {
      case "ArrowRight":
      case "ArrowDown":
        selectAndFocus(pieceNumber === count ? 1 : pieceNumber + 1);
        return true;
      case "ArrowLeft":
      case "ArrowUp":
        selectAndFocus(pieceNumber === 1 ? count : pieceNumber - 1);
        return true;
      case "Home":
        selectAndFocus(1);
        return true;
      case "End":
        selectAndFocus(count);
        return true;
      default:
        return false;
    }
  }

  return { refs, handleKeyDown };
}
