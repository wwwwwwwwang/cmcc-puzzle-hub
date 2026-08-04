"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { HallPostDto } from "@/features/posts/domain/types";
import { ClaimDrawer } from "./claim-drawer";

type PostCardProps = {
  post: HallPostDto;
  onRemoved?: (postId: string) => void;
};

export function PostCard({ post, onRemoved }: PostCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">
            {post.discount === 95 ? "95折" : post.discount === 90 ? "9折" : "8折"}
            {post.pieceNumber}号拼图
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {post.type === "GIVE" ? "赠送" : "求助"} · {post.payloadKind === "COMMAND" ? "口令" : "链接"}
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          领取
        </Button>
      </div>
      {open ? (
        <ClaimDrawer
          post={post}
          open={open}
          onOpenChange={setOpen}
          onClaimed={(postId) => {
            setOpen(false);
            onRemoved?.(postId);
          }}
        />
      ) : null}
    </article>
  );
}
