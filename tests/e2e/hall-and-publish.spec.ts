import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const GIVE_COMMAND =
  "送你一张多余的‘8折6号拼图’！，快来一起集拼图，8折充值券等你来赢，￥19uSvG￥ 复制此消息，打开中国移动客户端，马上领取。";
const GIVE_URL =
  "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html?targetUrl=https%3A%2F%2Fwx.10086.cn%2Fhlwyxhdhub%2Fact-wedrecharge%2F1024101716%3FgiveCard%3De728c7fc81f771f07c0491ee1afeac6c602855ea6c6ff236550705d032fa902eec43f56ac39454c76f35cef683460bb4&pageId=99992603311033047&channelId=P00000116211&sellerId=1636941HD1301000012";

const commandPost = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE",
  discount: 80,
  pieceNumber: 6,
  payloadKind: "COMMAND",
  createdAt: "2027-01-15T08:00:00.000Z",
  expiresAt: "2027-01-16T08:00:00.000Z",
};

async function installApiMocks(page: Page, post = commandPost) {
  await page.route("**/api/posts**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { items: [post], nextCursor: null } });
      return;
    }
    await route.fulfill({ status: 201, json: { post } });
  });
  await page.route("**/api/posts/*/claim", async (route) => {
    await route.fulfill({
      json: { payloadKind: "COMMAND", payload: "￥19uSvG￥" },
    });
  });
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("cmcc-puzzle-device-id", "e2e-device-id");
    (window as Window & { __launchCalls?: string[] }).__launchCalls = [];
    (window as Window & { __clipboardText?: string }).__clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { __clipboardText?: string }).__clipboardText = value;
        },
        readText: async () =>
          (window as Window & { __clipboardText?: string }).__clipboardText ?? "",
      },
    });
    (window as Window & { __CMCC_LAUNCH_APP__?: (url: string) => void }).__CMCC_LAUNCH_APP__ =
      (url) => {
        ((window as Window & { __launchCalls?: string[] }).__launchCalls ??= []).push(url);
      };
  });
});

test("口令发布到领取闭环只在确认后请求并提示手动打开", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/publish");
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByLabel("拼图口令").fill(GIVE_COMMAND);
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "领取" }).click();
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "领取" }).click();
  await page.getByRole("button", { name: "确认领取" }).click();
  await expect(page.getByText("若未自动跳转，请手动打开中国移动 APP")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __launchCalls?: string[] }).__launchCalls)).toEqual([
    "leadeon://",
  ]);
  await expect.poll(async () => await page.evaluate(() => navigator.clipboard.readText())).toBe("￥19uSvG￥");
});

test("二维码解析提交不上传图片", async ({ page }) => {
  const bodies: string[] = [];
  await page.route("**/api/posts**", async (route) => {
    if (route.request().method() === "POST") bodies.push(route.request().postData() ?? "");
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { items: [], nextCursor: null } });
      return;
    }
    await route.fulfill({ status: 201, json: { post: commandPost } });
  });
  await page.goto("/publish");
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByLabel("选择二维码图片").setInputFiles(resolve("tests/fixtures/give-url-qr.png"));
  await expect(page.getByText("8折6号·赠送")).toBeVisible();
  await page.getByRole("button", { name: "发布" }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toContain(GIVE_URL);
  expect(bodies[0]).not.toContain("multipart");
  expect(bodies[0]).not.toContain("data:image");
});

test("移动视口无横向溢出", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "领取" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
