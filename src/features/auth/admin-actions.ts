"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReviewState = { error?: string; success?: string };

async function review(
  formData: FormData,
  fn: "approve_user" | "reject_user",
  okMessage: string,
): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const targetId = formData.get("targetId");
  if (typeof targetId !== "string" || !targetId) {
    return { error: "参数无效" };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc(fn, {
      p_target: targetId,
      p_admin: user.id,
    });
    if (error) throw new Error(error.message);

    const status = (data as { status?: string })?.status;
    if (status === "FORBIDDEN") return { error: "无管理员权限" };
    if (status === "NOT_FOUND") return { error: "用户不存在" };

    revalidatePath("/admin");
    return { success: okMessage };
  } catch {
    return { error: "操作失败,请稍后重试" };
  }
}

export async function approveUser(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  return review(formData, "approve_user", "已通过");
}

export async function rejectUser(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  return review(formData, "reject_user", "已拒绝");
}
