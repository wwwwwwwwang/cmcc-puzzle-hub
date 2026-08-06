import { Gift } from "lucide-react";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
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
      <AccountSubpageHeader
        title="我领取的"
        description="保留领取成功的口令或链接，方便再次查看和使用。"
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="还没有领取过拼图"
          description="领取成功后，口令或链接会保留在这里。"
        />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="space-y-3 rounded-lg border border-slate-200 px-4 py-3"
            >
              <p className="text-sm font-semibold text-slate-900">
                {postTypeLabel(post.type)} · {discountLabel(post.discount)} · 第
                {post.pieceNumber} 块
              </p>
              {post.payloads.command ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-slate-500">口令</p>
                  <code className="mt-1 block break-all font-mono text-sm text-slate-800">
                    {post.payloads.command}
                  </code>
                </div>
              ) : null}
              {post.payloads.url ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-slate-500">链接</p>
                  <a
                    href={post.payloads.url}
                    className="mt-1 block break-all text-sm text-blue-600 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {post.payloads.url}
                  </a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
