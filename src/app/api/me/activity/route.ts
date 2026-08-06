import { getAccountActivity } from "@/features/posts/server/user-queries";

export async function GET() {
  const activity = await getAccountActivity();
  if (!activity) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(activity, {
    headers: { "Cache-Control": "no-store" },
  });
}
