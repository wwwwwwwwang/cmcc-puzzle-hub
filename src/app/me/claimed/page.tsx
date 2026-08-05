import {
  discountLabel,
  postTypeLabel,
} from "@/features/posts/components/post-status-label";
import { getMyClaimedPosts } from "@/features/posts/server/user-queries";

export const dynamic = "force-dynamic";

export default async function ClaimedPostsPage() {
  const posts = await getMyClaimedPosts();

  return (
    <div className="space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          我领取的
        </h1>
        <p className="text-sm text-slate-500">
          这里保留你领取成功的口令或链接,方便再次复制使用。
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-slate-400">还没有领取过拼图。</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="space-y-2 rounded-lg border border-slate-100 px-3 py-2.5"
            >
              <p className="text-sm font-medium text-slate-900">
                {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第
                {post.pieceNumber} 块
              </p>
              {post.payloads.command ? (
                <p className="break-all text-sm text-slate-600">
                  口令:
                  <code className="ml-1 font-mono">{post.payloads.command}</code>
                </p>
              ) : null}
              {post.payloads.url ? (
                <p className="break-all text-sm text-slate-600">
                  链接:
                  <a
                    href={post.payloads.url}
                    className="ml-1 text-blue-600 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {post.payloads.url}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
