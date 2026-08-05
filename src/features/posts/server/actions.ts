"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/supabase/server";
import { delistPost } from "./post-repository";

export type DelistState = { error?: string; success?: boolean };

/**
 * 下架当前用户自己未被领取的帖子。经会话校验后以 service role 调用
 * delist_post(RPC 内再次校验 publisher_id 归属)。
 */
export async function delistMyPost(
  _prevState: DelistState,
  formData: FormData,
): Promise<DelistState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const postId = formData.get("postId");
  if (typeof postId !== "string" || !postId) {
    return { error: "参数无效" };
  }

  try {
    const result = await delistPost(postId, user.id);
    if (result.status !== "DELISTED") {
      return { error: "该帖子无法下架(可能已被领取或已过期)" };
    }
    revalidatePath("/me/posts");
    return { success: true };
  } catch {
    return { error: "下架失败,请稍后重试" };
  }
}
