"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { HallPostDto } from "@/features/posts/domain/types";
import { ClaimDrawer } from "./claim-drawer";
import { formatRelativeTime } from "./relative-time";

type PostCardProps = {
  post: HallPostDto;
  onRemoved?: (postId: string) => void;
};

export function PostCard({ post, onRemoved }: PostCardProps) {
  const [open, setOpen] = useState(false);
  const claimedRef = useRef(false);

  const sourceLabel =
    post.availablePayloadKinds.length === 2
      ? "口令 + 链接"
      : post.availablePayloadKinds[0] === "COMMAND"
        ? "仅有口令"
        : "仅有链接";

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && claimedRef.current) {
      onRemoved?.(post.id);
    }
  }

  return (
    <article className="rounded-lg border border-slate-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition hover:border-slate-200 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                post.type === "GIVE"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              {post.type === "GIVE" ? "出/赠" : "求助"}
            </span>
            <span>
              {post.discount === 95
                ? "95折"
                : post.discount === 90
                  ? "9折"
                  : "8折"}
              {` · 第 ${post.pieceNumber} 号`}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">
            {sourceLabel} · {formatRelativeTime(post.createdAt)}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-blue-600 px-[18px] text-white shadow-[0_2px_4px_rgba(37,99,235,0.2)] hover:bg-blue-700"
        >
          一键获取
        </Button>
      </div>
      {open ? (
        <ClaimDrawer
          post={post}
          open={open}
          onOpenChange={handleOpenChange}
          onClaimed={() => {
            claimedRef.current = true;
          }}
        />
      ) : null}
    </article>
  );
}
