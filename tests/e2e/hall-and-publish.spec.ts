import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

import {
  GIVE_COMMAND,
  GIVE_NORMALIZED_COMMAND,
  GIVE_URL,
  REQUEST_COMMAND,
} from "../fixtures/cmcc-samples";
import { E2E_AUTH_COOKIE } from "../../src/lib/testing/e2e-auth";

const CURRENT_PUBLIC_ID = "U-0123456789ABCDEF";
const OTHER_PUBLIC_ID = "U-FEDCBA9876543210";

const commandPost = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE",
  publisherId: OTHER_PUBLIC_ID,
  discount: 80,
  pieceNumber: 6,
  availablePayloadKinds: ["COMMAND"],
  createdAt: "2027-01-15T08:00:00.000Z",
  expiresAt: "2027-01-16T08:00:00.000Z",
};

const urlPost = { ...commandPost, availablePayloadKinds: ["URL"] };
const dualPost = {
  ...commandPost,
  availablePayloadKinds: ["COMMAND", "URL"],
};
const selfRequestPost = {
  ...commandPost,
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174001",
  type: "REQUEST",
  publisherId: CURRENT_PUBLIC_ID,
};

type ApiMockOptions = {
  post?: typeof commandPost;
  payloads?: { command?: string; url?: string };
};

async function installApiMocks(
  page: Page,
  { post = commandPost, payloads = { command: GIVE_NORMALIZED_COMMAND } }: ApiMockOptions = {},
) {
  const calls = {
    claim: 0,
    help: 0,
    publishBodies: [] as string[],
    listUrls: [] as string[],
  };

  await page.route("**/api/posts**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith("/claim")) {
      calls.claim += 1;
      await route.fulfill({ json: { payloads, idempotent: false } });
      return;
    }

    if (pathname.endsWith("/help")) {
      calls.help += 1;
      await route.fulfill({
        json: {
          payloads,
          idempotent: false,
          confirmationDeadline: "2027-01-16T08:00:00.000Z",
        },
      });
      return;
    }

    if (request.method() === "GET") {
      calls.listUrls.push(request.url());
      await route.fulfill({ json: { items: [post], nextCursor: null } });
      return;
    }

    calls.publishBodies.push(request.postData() ?? "");
    await route.fulfill({ status: 201, json: { post } });
  });

  return calls;
}

async function interceptCmccNavigation(page: Page) {
  let receivedHeaders: Record<string, string> = {};

  await page.route("https://h.app.coc.10086.cn/**", async (route) => {
    receivedHeaders = route.request().headers();
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>CMCC</title>",
    });
  });

  return () => receivedHeaders;
}

test.beforeEach(async ({ context }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL;
  const authToken = process.env.E2E_TEST_AUTH_TOKEN;
  if (typeof baseUrl !== "string" || typeof authToken !== "string") {
    throw new Error("Playwright E2E 测试认证环境未初始化");
  }

  await context.addCookies([
    {
      name: E2E_AUTH_COOKIE,
      value: authToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await context.addInitScript(() => {
    const testWindow = window as Window & {
      __claimEvents?: string[];
      __clipboardShouldFail?: boolean;
      __clipboardText?: string;
      __CMCC_LAUNCH_APP__?: (url: string) => void;
    };
    testWindow.__claimEvents = [];
    testWindow.__clipboardShouldFail = false;
    testWindow.__clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          if (testWindow.__clipboardShouldFail) {
            throw new Error("clipboard denied");
          }
          testWindow.__clipboardText = value;
          testWindow.__claimEvents?.push(`clipboard:${value}`);
        },
        readText: async () => testWindow.__clipboardText ?? "",
      },
    });
    testWindow.__CMCC_LAUNCH_APP__ = (url) => {
      testWindow.__claimEvents?.push(`launch:${url}`);
    };
  });
});

test("仅口令发布和领取保持复制后唤起顺序", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/publish");
  await page.getByRole("button", { name: "赠送拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByLabel("拼图口令").fill(GIVE_COMMAND);
  await page.getByRole("button", { name: "发布" }).click();

  await expect(page).toHaveURL(/\/$/);
  expect(JSON.parse(calls.publishBodies[0])).toMatchObject({
    type: "GIVE",
    sources: { command: GIVE_COMMAND },
  });

  await page.getByRole("button", { name: "获取拼图" }).click();
  await page.getByRole("button", { name: "关闭领取弹窗" }).click();
  expect(calls.claim).toBe(0);
  await page.getByRole("button", { name: "获取拼图" }).click();
  await page.getByRole("button", { name: "使用口令领取" }).click();

  await expect(page.getByText("若未自动跳转，请手动打开中国移动 APP")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __claimEvents?: string[] }).__claimEvents,
      ),
    )
    .toEqual([
      `clipboard:${GIVE_NORMALIZED_COMMAND}`,
      "launch:leadeon://",
    ]);
  expect(calls.claim).toBe(1);
  expect(calls.help).toBe(0);
});

test("仅二维码链接发布和领取不上传图片", async ({ page }) => {
  const calls = await installApiMocks(page, {
    post: urlPost,
    payloads: { url: GIVE_URL },
  });
  const getCmccHeaders = await interceptCmccNavigation(page);
  await page.goto("/publish");
  await page.getByRole("button", { name: "赠送拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByRole("tab", { name: "上传二维码" }).click();
  await page
    .getByLabel("选择二维码图片")
    .setInputFiles(resolve("tests/fixtures/give-url-qr.png"));
  await expect(page.getByText("8折6号·赠送")).toBeVisible();
  await page.getByRole("button", { name: "发布" }).click();

  await expect.poll(() => calls.publishBodies.length).toBe(1);
  const body = JSON.parse(calls.publishBodies[0]);
  expect(body.type).toBe("GIVE");
  expect(body.sources).toEqual({ url: GIVE_URL });
  expect(calls.publishBodies[0]).not.toContain("multipart");
  expect(calls.publishBodies[0]).not.toContain("data:image");

  await page.getByRole("button", { name: "获取拼图" }).click();
  await page.getByRole("button", { name: "使用链接领取" }).click();
  await page.waitForURL((url) => url.hostname === "h.app.coc.10086.cn");
  const cmccHeaders = getCmccHeaders();
  expect(cmccHeaders["x-e2e-auth-token"]).toBeUndefined();
  expect(cmccHeaders.cookie ?? "").not.toContain(`${E2E_AUTH_COOKIE}=`);
  expect(calls.claim).toBe(1);
});

test("双来源复制失败后改用链接不会重复领取", async ({ page }) => {
  const calls = await installApiMocks(page, {
    post: dualPost,
    payloads: { command: GIVE_NORMALIZED_COMMAND, url: GIVE_URL },
  });
  await interceptCmccNavigation(page);
  await page.goto("/publish");
  await page.getByRole("button", { name: "赠送拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByLabel("拼图口令").fill(GIVE_COMMAND);
  await page.getByRole("tab", { name: "上传二维码" }).click();
  await page
    .getByLabel("选择二维码图片")
    .setInputFiles(resolve("tests/fixtures/give-url-qr.png"));
  await expect(page.getByText("将保存：口令 + 链接")).toBeVisible();
  await page.getByRole("button", { name: "发布" }).click();

  const body = JSON.parse(calls.publishBodies[0]);
  expect(body.type).toBe("GIVE");
  expect(body.sources).toEqual({ command: GIVE_COMMAND, url: GIVE_URL });
  await page.evaluate(() => {
    (window as Window & { __clipboardShouldFail?: boolean }).__clipboardShouldFail = true;
  });

  await page.getByRole("button", { name: "获取拼图" }).click();
  await expect(page.getByRole("button", { name: "使用口令领取" })).toBeVisible();
  await expect(page.getByRole("button", { name: "使用链接领取" })).toBeVisible();
  await page.getByRole("button", { name: "使用口令领取" }).click();
  await expect(page.getByRole("alert")).toContainText("复制失败");
  await expect(page.getByText(GIVE_NORMALIZED_COMMAND)).toBeVisible();
  expect(calls.claim).toBe(1);

  await page.getByRole("button", { name: "改用链接" }).click();
  await page.waitForURL((url) => url.hostname === "h.app.coc.10086.cn");
  expect(calls.claim).toBe(1);
});

test("发布页要求先选类型并阻止类型冲突", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/publish");

  await expect(page.getByRole("radio", { name: "8折1号拼图" })).toBeDisabled();
  await expect(page.getByLabel("拼图口令")).toBeDisabled();
  await page.getByRole("button", { name: "求助拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByLabel("拼图口令").fill(GIVE_COMMAND);
  await expect(
    page.getByText("选择的是求助，但内容识别为赠送，请更换内容或发布类型"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "发布" })).toBeDisabled();
  expect(calls.publishBodies).toHaveLength(0);
});

test("求助内容按类型优先流程发布", async ({ page }) => {
  const requestPost = {
    ...commandPost,
    type: "REQUEST",
  } as typeof commandPost;
  const calls = await installApiMocks(page, {
    post: requestPost,
    payloads: { command: REQUEST_COMMAND },
  });
  await page.goto("/publish");

  await page.getByRole("button", { name: "求助拼图" }).click();
  await page.getByRole("radio", { name: "8折1号拼图" }).click();
  await page.getByLabel("拼图口令").fill(REQUEST_COMMAND);
  await expect(page.getByText("8折1号·求助")).toBeVisible();
  await page.getByRole("button", { name: "发布" }).click();

  await expect.poll(() => calls.publishBodies.length).toBe(1);
  expect(JSON.parse(calls.publishBodies[0])).toMatchObject({
    type: "REQUEST",
    sources: { command: REQUEST_COMMAND },
  });

  await page.getByRole("button", { name: "去助力" }).click();
  await page.getByRole("button", { name: "使用口令助力" }).click();
  await expect(page.getByText("助力已提交，等待对方确认")).toBeVisible();
  expect(calls.help).toBe(1);
  expect(calls.claim).toBe(0);
});

test("大厅按参考稿筛选折扣、类型和拼图编号", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "8折(9块)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("radio", { name: "8折6号拼图" })).toBeVisible();

  await page.getByRole("button", { name: "只看赠送" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();

  await expect(page).toHaveURL(/type=GIVE/);
  await expect(page).toHaveURL(/pieceNumber=6/);
  await expect
    .poll(() => calls.listUrls.at(-1) ?? "")
    .toContain("pieceNumber=6");

  await page.getByRole("button", { name: "95折(4块)" }).click();
  await expect(page).not.toHaveURL(/pieceNumber=/);
  await expect(page.getByRole("radio")).toHaveCount(4);
});

test("大厅展示公开用户标识并为本人求助帖使用助力文案", async ({ page }) => {
  await installApiMocks(page, {
    post: selfRequestPost,
    payloads: { command: REQUEST_COMMAND },
  });
  await page.goto("/");

  await expect(page.getByText("当前用户", { exact: true })).toBeVisible();
  await expect(page.locator("code")).toHaveText(CURRENT_PUBLIC_ID);
  await expect(
    page.getByText(`发布者 ${CURRENT_PUBLIC_ID}（我）`, { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "去助力" }).click();
  await expect(page.getByText("请选择助力方式")).toBeVisible();
  await expect(page.getByRole("button", { name: "使用口令助力" })).toBeVisible();
});

test("大厅、领取抽屉和发布页无横向溢出", async ({ page }) => {
  await installApiMocks(page, { post: dualPost });
  await page.goto("/");
  await expect(page.getByText("最新发布")).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
  await expect(page.getByRole("button", { name: "获取拼图" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "8折拼图选择" })).toHaveCSS(
    "width",
    "270px",
  );
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector("header")!).position))
    .toBe("sticky");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole("button", { name: "获取拼图" }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.goto("/publish");
  await page.getByRole("button", { name: "赠送拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page.getByRole("tab", { name: "上传二维码" }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
