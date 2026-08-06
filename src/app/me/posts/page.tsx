import { ClipboardList } from "lucide-react";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
import { ConfirmationCountdown } from "@/features/posts/components/confirmation-countdown";
import { DelistButton } from "@/features/posts/components/delist-button";
import {
  discountLabel,
  postStatusLabel,
  postTypeLabel,
} from "@/features/posts/components/post-status-label";
import { RequestHelpActions } from "@/features/posts/components/request-help-actions";
import type { MyPost } from "@/features/posts/server/user-queries";
import { getMyPosts } from "@/features/posts/server/user-queries";

export const dynamic = "force-dynamic";

export default async function MyPostsPage() {
  const posts = await getMyPosts();

  return (
    <div className="space-y-6 px-4 py-6">
      <AccountSubpageHeader
        title="我的帖子"
        description="管理赠送和求助进度；开放中的帖子可以主动下架。"
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="还没有发布过拼图"
          description="发布成功后，可以在这里查看状态并管理可领取的帖子。"
        />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="space-y-3 rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第
                    {post.pieceNumber} 块
                  </p>
                  <p className="text-xs text-slate-500">{postSummary(post)}</p>
                </div>
                {post.status === "OPEN" ? <DelistButton postId={post.id} /> : null}
              </div>

              {post.type === "REQUEST" &&
              post.status === "PENDING_CONFIRM" &&
              post.confirmationDeadline ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">24 小时后自动确认</p>
                  <p className="text-sm font-medium text-slate-700">
                    <ConfirmationCountdown deadline={post.confirmationDeadline} />
                  </p>
                  <RequestHelpActions postId={post.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function postSummary(post: MyPost) {
  if (post.type === "GIVE") return postStatusLabel(post.status, post.type);
  if (post.status === "PENDING_CONFIRM") return "等待你确认";
  if (post.status === "COMPLETED") {
    return post.confirmationMethod === "AUTO"
      ? "已自动确认收到"
      : "已主动确认收到";
  }
  if (post.status === "EXPIRED") {
    return post.closureReason === "DELISTED"
      ? "已下架并退还信用"
      : "已过期并退还信用";
  }
  return postStatusLabel(post.status, post.type);
}
