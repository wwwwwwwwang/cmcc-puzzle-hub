"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getApprovedUser, getCurrentUser } from "@/lib/supabase/server";
import { delistPost, resolveRequestHelp } from "./post-repository";

export type DelistState = { error?: string; success?: boolean };
export type RequestHelpActionState = { error?: string; success?: string };

const postIdSchema = z.uuid();

function readPostId(formData: FormData) {
  const result = postIdSchema.safeParse(formData.get("postId"));
  return result.success ? result.data : null;
}

function revalidateAccountPaths() {
  revalidatePath("/me");
  revalidatePath("/me/posts");
  revalidatePath("/me/helped");
}

function mapResolveError(status: string): RequestHelpActionState {
  if (status === "FORBIDDEN") return { error: "无权处理该求助" };
  if (status === "NOT_PENDING") return { error: "该求助已处理或无需确认" };
  return { error: "求助状态异常，请刷新后重试" };
}

/**
 * 下架当前用户自己未被领取的帖子。经会话校验后以 service role 调用
 * delist_post(RPC 内再次校验 publisher_id 归属)。
 */
export async function delistMyPost(
  _prevState: DelistState,
  formData: FormData,
): Promise<DelistState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "请先登录" };
  const user = await getApprovedUser();
  if (!user) return { error: "请先审核通过后再操作" };

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

export async function confirmReceived(
  _prevState: RequestHelpActionState,
  formData: FormData,
): Promise<RequestHelpActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "请先登录" };
  const user = await getApprovedUser();
  if (!user) return { error: "请先审核通过后再操作" };

  const postId = readPostId(formData);
  if (!postId) return { error: "参数无效" };

  try {
    const result = await resolveRequestHelp(postId, user.id, true);
    if (result.status !== "COMPLETED") return mapResolveError(result.status);

    revalidateAccountPaths();
    return { success: "已确认收到" };
  } catch {
    return { error: "确认失败，请稍后重试" };
  }
}

export async function reportNotReceived(
  _prevState: RequestHelpActionState,
  formData: FormData,
): Promise<RequestHelpActionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "请先登录" };
  const user = await getApprovedUser();
  if (!user) return { error: "请先审核通过后再操作" };

  const postId = readPostId(formData);
  if (!postId) return { error: "参数无效" };

  try {
    const result = await resolveRequestHelp(postId, user.id, false);
    if (result.status === "REOPENED") {
      revalidateAccountPaths();
      return { success: "已反馈未收到，帖子已重新开放" };
    }
    if (result.status === "EXPIRED") {
      revalidateAccountPaths();
      return { success: "已反馈未收到，帖子已过期并退还信用" };
    }
    return mapResolveError(result.status);
  } catch {
    return { error: "反馈失败，请稍后重试" };
  }
}
