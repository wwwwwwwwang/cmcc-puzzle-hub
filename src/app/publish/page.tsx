"use client";

import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PublishPanel } from "@/features/posts/components/publish-panel";
import { PuzzleBoard } from "@/features/posts/components/puzzle-board";
import type { Discount } from "@/features/posts/domain/types";

const discounts = [95, 90, 80] as const satisfies readonly Discount[];

export default function PublishPage() {
  const [discount, setDiscount] = useState<Discount>(80);
  const [pieceNumber, setPieceNumber] = useState<number | null>(null);

  function handleDiscountChange(value: string | number | null) {
    const nextDiscount = Number(value) as Discount;
    if (!discounts.includes(nextDiscount)) return;
    setDiscount(nextDiscount);
    setPieceNumber(null);
  }

  return (
    <div className="space-y-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-blue-600">发布拼图</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          分享或求助一块拼图
        </h1>
        <p className="text-sm text-slate-500">先选择折扣与拼图编号，再粘贴口令或识别二维码。</p>
      </header>

      <section className="space-y-4" aria-labelledby="puzzle-selection-title">
        <h2 id="puzzle-selection-title" className="text-base font-semibold text-slate-900">
          选择拼图
        </h2>
        <Tabs value={discount} onValueChange={handleDiscountChange}>
          <TabsList className="grid h-10 w-full grid-cols-3">
            <TabsTrigger value={95}>95折</TabsTrigger>
            <TabsTrigger value={90}>9折</TabsTrigger>
            <TabsTrigger value={80}>8折</TabsTrigger>
          </TabsList>
        </Tabs>
        <PuzzleBoard
          discount={discount}
          value={pieceNumber}
          onChange={setPieceNumber}
        />
      </section>

      <section className="border-t border-slate-100 pt-5" aria-label="发布内容">
        <PublishPanel discount={discount} pieceNumber={pieceNumber} />
      </section>
    </div>
  );
}
