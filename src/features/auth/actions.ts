"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRegistrationRateLimit } from "@/features/posts/server/rate-limit";
import { credentialsSchema } from "./schemas";
import { normalizeUsername, usernameToSyntheticEmail } from "./username";

export type AuthActionState = {
  error?: string;
  fieldErrors?: { username?: string; password?: string };
};

function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
}

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): AuthActionState["fieldErrors"] {
  const fieldErrors: { username?: string; password?: string } = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (key === "username" && !fieldErrors.username) {
      fieldErrors.username = issue.message;
    }
    if (key === "password" && !fieldErrors.password) {
      fieldErrors.password = issue.message;
    }
  }
  return fieldErrors;
}

function safeRedirect(target: FormDataEntryValue | null): string {
  if (typeof target === "string" && /^\/(?!\/)/.test(target)) return target;
  return "/";
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip")?.trim() || "unknown";
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToSyntheticEmail(parsed.data.username),
    password: parsed.data.password,
  });

  // 不区分「用户名不存在」与「密码错误」,避免用户名枚举。
  if (error || !data.user) return { error: "用户名或密码不正确" };

  // 审核门控:未通过审核立即登出并提示。
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, rejection_reason")
    .eq("id", data.user.id)
    .single();

  if (profile?.status !== "APPROVED") {
    await supabase.auth.signOut();
    if (profile?.status === "BANNED") {
      return { error: "该账号已被封禁,请联系管理员" };
    }
    if (profile?.status === "REJECTED") {
      const reason =
        typeof profile.rejection_reason === "string"
          ? profile.rejection_reason.trim()
          : "";
      return {
        error: reason
          ? `该账号审核未通过：${reason}`
          : "该账号审核未通过，请联系管理员确认",
      };
    }
    return {
      error: "账号待审核:请将微信群昵称改为与用户名一致,并 @管理员 审核通过后再登录",
    };
  }

  redirect(safeRedirect(formData.get("redirect")));
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const ip = await clientIp();
  const rate = await checkRegistrationRateLimit(ip);
  if (!rate.success) {
    return { error: "该网络注册过于频繁,请稍后再试" };
  }

  const username = parsed.data.username.trim();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: usernameToSyntheticEmail(username),
    password: parsed.data.password,
    options: {
      data: { username: normalizeUsername(username), registration_ip: ip },
    },
  });

  // 合成邮箱唯一 → 重名注册会失败,归一化为「用户名已被占用」。
  if (error) {
    return { error: "该用户名已被占用或注册失败,请更换后重试" };
  }

  // username 展示原始大小写:signUp 触发器已用归一化值建行,这里用 admin 补写原始 username。
  if (data.user) {
    const admin = createSupabaseAdminClient();
    await admin.from("profiles").update({ username }).eq("id", data.user.id);
    // 注册后不建立会话(需审核),显式登出以防自动登录。
    await supabase.auth.signOut();
  }

  return {
    error:
      "注册成功,账号待审核。请将微信群昵称改为与用户名一致,并 @管理员 审核通过后登录。",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
