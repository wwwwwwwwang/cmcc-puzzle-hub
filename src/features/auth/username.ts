import "server-only";

import { createHash } from "node:crypto";

// 合成邮箱域(用户永不接触;仅用于喂给 Supabase Auth)。
const SYNTHETIC_EMAIL_DOMAIN = "puzzle.internal";

/**
 * 归一化用户名:去空白 + 转小写。用于唯一性判断与合成邮箱派生,
 * 避免大小写/前后空格造成的重复或冒充。展示用原始 username 另存。
 */
export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

/**
 * 由归一化用户名派生**确定性**合成邮箱。
 * 用户名可能含中文(群昵称),不能直接进邮箱,故取 SHA-256 前 32 位十六进制。
 * 确定性保证:同一用户名每次登录都映射到同一邮箱;唯一性由 Supabase Auth
 * 的邮箱唯一约束天然保证 → 重名注册会失败,不产生孤儿账号。
 */
export function usernameToSyntheticEmail(username: string) {
  const hash = createHash("sha256")
    .update(normalizeUsername(username))
    .digest("hex")
    .slice(0, 32);
  return `${hash}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
