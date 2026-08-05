import { z } from "zod";

// 用户名:2–20 字符,允许中英文、数字、下划线、连字符(便于与微信群昵称一致)。
const USERNAME_PATTERN = /^[一-龥A-Za-z0-9_-]{2,20}$/;

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(USERNAME_PATTERN, {
      message: "用户名需为 2-20 位中英文、数字、下划线或连字符",
    }),
  password: z
    .string()
    .min(8, { message: "密码至少 8 位" })
    .max(72, { message: "密码最多 72 位" }),
});

export type Credentials = z.infer<typeof credentialsSchema>;
