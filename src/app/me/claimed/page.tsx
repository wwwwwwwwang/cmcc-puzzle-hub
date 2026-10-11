import { Gift } from "lucide-react";
import Link from "next/link";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
import {
  discountLabel,
  postTypeLabel,
} from "@/features/posts/components/post-status-label";
import { getMyClaimedPosts } from "@/features/posts/server/user-queries";

export const dynamic = "force-dynamic";

type ClaimedPostsPageProps = {
  searchParams?: Promise<{ cursor?: string | string[] }>;
};

export default async function ClaimedPostsPage({
  searchParams,
}: ClaimedPostsPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const page = await getMyClaimedPosts(readCursor(params.cursor));
  const posts = page.items;

  return (
    <div className="space-y-6 px-4 py-6">
      <AccountSubpageHeader
        title="我领取的"
        description="保留领取成功的二维码链接，方便再次查看和使用。"
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="还没有领取过拼图"
          description="领取成功后，二维码链接会保留在这里。"
        />
      ) : (
        <div className="space-y-3">
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
                {post.payloads.url ? (
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <p className="text-xs font-medium text-slate-500">二维码</p>
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
          {page.nextCursor ? (
            <Link
              href={`/me/claimed?cursor=${encodeURIComponent(page.nextCursor)}`}
              className="flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:border-blue-200 hover:text-blue-700"
            >
              加载更多
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function readCursor(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
