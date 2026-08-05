"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/features/auth/auth-session";
import type { HallPostDto } from "@/features/posts/domain/types";
import { ClaimDrawer } from "./claim-drawer";
import { formatRelativeTime } from "./relative-time";

type PostCardProps = {
  post: HallPostDto;
  onRemoved?: (postId: string) => void;
};

export function PostCard({ post, onRemoved }: PostCardProps) {
  const { publicId } = useAuthSession();
  const [open, setOpen] = useState(false);
  const claimedRef = useRef(false);

  const sourceLabel =
    post.availablePayloadKinds.length === 2
      ? "口令 + 链接"
      : post.availablePayloadKinds[0] === "COMMAND"
        ? "仅有口令"
        : "仅有链接";
  const isOwnPost = publicId !== null && publicId === post.publisherId;
  const metaLabel = `发布者 ${post.publisherId}${isOwnPost ? "（我）" : ""} · ${sourceLabel} · ${formatRelativeTime(post.createdAt)}`;

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
          <p className="break-words text-xs leading-5 text-slate-500">
            {metaLabel}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className={`shrink-0 rounded-full px-[18px] text-white ${
            post.type === "GIVE"
              ? "bg-blue-600 shadow-[0_2px_4px_rgba(37,99,235,0.2)] hover:bg-blue-700"
              : "bg-orange-500 shadow-[0_2px_4px_rgba(249,115,22,0.2)] hover:bg-orange-600"
          }`}
        >
          {post.type === "GIVE" ? "获取拼图" : "去助力"}
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
