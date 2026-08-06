import { CircleHelp } from "lucide-react";

import { AccountSubpageHeader } from "@/features/account/components/account-subpage-header";
import { EmptyState } from "@/features/account/components/empty-state";
import { ConfirmationCountdown } from "@/features/posts/components/confirmation-countdown";
import { HelpedPayloadActions } from "@/features/posts/components/helped-payload-actions";
import { discountLabel } from "@/features/posts/components/post-status-label";
import type { MyHelpedPost } from "@/features/posts/server/user-queries";
import { getMyHelpedPosts } from "@/features/posts/server/user-queries";

export const dynamic = "force-dynamic";

export default async function HelpedPostsPage() {
  const posts = await getMyHelpedPosts();

  return (
    <div className="space-y-6 px-4 py-6">
      <AccountSubpageHeader
        title="我帮助的"
        description="查看助力确认进度，并再次使用已提交的口令或链接。"
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={CircleHelp}
          title="还没有帮助过求助"
          description="完成一次求助助力后，确认状态和内容会保留在这里。"
        />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li
              key={post.attemptId}
              className="space-y-3 rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  求助 · {discountLabel(post.discount)} · 第 {post.pieceNumber} 块
                </p>
                <p className="text-xs text-slate-500">{helpStatusLabel(post)}</p>
              </div>

              {post.status === "PENDING" ? (
                <p className="text-sm font-medium text-slate-700">
                  <ConfirmationCountdown deadline={post.confirmationDeadline} />
                </p>
              ) : null}

              <div className="border-t border-slate-100 pt-3">
                <HelpedPayloadActions payloads={post.payloads} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function helpStatusLabel(post: MyHelpedPost) {
  if (post.status === "PENDING") return "等待对方确认";
  if (post.status === "REJECTED") return "对方未收到，本次助力未完成";
  return post.confirmationMethod === "AUTO"
    ? "对方已自动确认收到"
    : "对方已确认收到";
}
