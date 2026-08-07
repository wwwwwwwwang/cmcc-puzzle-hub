"use client";

import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PublishPanel } from "@/features/posts/components/publish-panel";
import { PuzzleBoard } from "@/features/posts/components/puzzle-board";
import type { Discount, PostType } from "@/features/posts/domain/types";

const discounts = [95, 90, 80] as const satisfies readonly Discount[];
const postTypes = [
  { value: "GIVE" as const, label: "赠送拼图" },
  { value: "REQUEST" as const, label: "求助拼图" },
];

export default function PublishPage() {
  const [postType, setPostType] = useState<PostType | null>(null);
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          分享或求助一块拼图
        </h1>
        <p className="text-sm text-slate-500">
          先选择发布类型，再选择拼图并识别二维码。
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="post-type-title">
        <h2
          id="post-type-title"
          className="text-base font-semibold text-slate-900"
        >
          选择发布类型
        </h2>
        <div className="flex rounded-[10px] bg-slate-100 p-1">
          {postTypes.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={postType === option.value}
              onClick={() => setPostType(option.value)}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
                postType === option.value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="puzzle-selection-title">
        <h2 id="puzzle-selection-title" className="text-base font-semibold text-slate-900">
          选择拼图
        </h2>
        <Tabs value={discount} onValueChange={handleDiscountChange}>
          <TabsList className="grid h-10 w-full grid-cols-3">
            <TabsTrigger value={95} disabled={postType === null}>
              95折
            </TabsTrigger>
            <TabsTrigger value={90} disabled={postType === null}>
              9折
            </TabsTrigger>
            <TabsTrigger value={80} disabled={postType === null}>
              8折
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <PuzzleBoard
          discount={discount}
          value={pieceNumber}
          onChange={setPieceNumber}
          disabled={postType === null}
        />
      </section>

      <section className="border-t border-slate-100 pt-5" aria-label="发布内容">
        <PublishPanel
          postType={postType}
          discount={discount}
          pieceNumber={pieceNumber}
        />
      </section>
    </div>
  );
}
