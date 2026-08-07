"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { credentialsSchema } from "./schemas";

export type ReviewState = { error?: string; success?: string };

function mapAdminStatus(status: string | undefined): ReviewState | null {
  if (status === "FORBIDDEN") return { error: "无管理员权限" };
  if (status === "SELF_FORBIDDEN") return { error: "不能封禁自己" };
  if (status === "ADMIN_TARGET_FORBIDDEN") return { error: "不能操作管理员账号" };
  if (status === "NOT_FOUND") return { error: "用户不存在" };
  if (status === "INVALID_STATUS") return { error: "用户状态不允许此操作" };
  return null;
}

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
    const mapped = mapAdminStatus(status);
    if (mapped) return mapped;

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/me");
    return { success: okMessage };
  } catch {
    return { error: "操作失败,请稍后重试" };
  }
}

async function manageStatus(
  formData: FormData,
  fn: "ban_user" | "unban_user",
  okMessage: string,
): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const targetId = formData.get("targetId");
  if (typeof targetId !== "string" || !targetId) return { error: "参数无效" };

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc(fn, {
      p_target: targetId,
      p_admin: user.id,
    });
    if (error) throw new Error(error.message);

    const mapped = mapAdminStatus((data as { status?: string })?.status);
    if (mapped) return mapped;

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/me");
    return { success: okMessage };
  } catch {
    return { error: "操作失败,请稍后重试" };
  }
}

export async function banUser(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  return manageStatus(formData, "ban_user", "已封禁");
}

export async function unbanUser(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  return manageStatus(formData, "unban_user", "已解封");
}

export async function setUserPassword(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const targetId = formData.get("targetId");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  if (typeof targetId !== "string" || !targetId) return { error: "参数无效" };
  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { error: "请输入密码" };
  }
  const parsed = credentialsSchema.shape.password.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "密码格式无效" };
  if (password !== confirmPassword) return { error: "两次密码输入不一致" };

  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  try {
    const admin = createSupabaseAdminClient();
    const { data: actor } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!actor?.is_admin) return { error: "无管理员权限" };

    const { data: target } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", targetId)
      .single();
    if (!target) return { error: "用户不存在" };
    if (target.is_admin) return { error: "不能操作管理员账号" };

    const { error } = await admin.auth.admin.updateUserById(targetId, {
      password,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/admin");
    return { success: "密码已设置" };
  } catch {
    return { error: "密码设置失败,请稍后重试" };
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
