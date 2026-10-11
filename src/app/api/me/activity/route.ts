import { runMaintenanceFallback } from "@/features/posts/server/maintenance-fallback";
import { getAccountActivity } from "@/features/posts/server/user-queries";

export async function GET() {
  try {
    await runMaintenanceFallback();
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
  } catch {
    return Response.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "服务暂时不可用" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
