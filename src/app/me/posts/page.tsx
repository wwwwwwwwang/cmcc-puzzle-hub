import { ClipboardList } from "lucide-react";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
import { DelistButton } from "@/features/posts/components/delist-button";
import {
  discountLabel,
  postStatusLabel,
  postTypeLabel,
} from "@/features/posts/components/post-status-label";
import { getMyPosts } from "@/features/posts/server/user-queries";

export const dynamic = "force-dynamic";

export default async function MyPostsPage() {
  const posts = await getMyPosts();

  return (
    <div className="space-y-6 px-4 py-6">
      <AccountSubpageHeader
        title="我的帖子"
        description="查看发布状态；仅“可领取”状态的帖子可以主动下架。"
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
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第
                  {post.pieceNumber} 块
                </p>
                <p className="text-xs text-slate-500">
                  {postStatusLabel(post.status)}
                </p>
              </div>
              {post.status === "OPEN" ? <DelistButton postId={post.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
