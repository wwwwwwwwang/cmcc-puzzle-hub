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
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          我的帖子
        </h1>
        <p className="text-sm text-slate-500">
          仅「可领取」状态的帖子可以主动下架。
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-slate-400">还没有发布过拼图。</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5"
            >
              <div className="space-y-0.5 text-sm">
                <p className="font-medium text-slate-900">
                  {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第
                  {post.pieceNumber} 块
                </p>
                <p className="text-xs text-slate-400">
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
