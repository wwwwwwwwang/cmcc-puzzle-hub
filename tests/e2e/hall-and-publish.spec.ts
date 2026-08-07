import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

import { GIVE_URL } from "../fixtures/cmcc-samples";
import { E2E_AUTH_COOKIE } from "../../src/lib/testing/e2e-auth";

const CURRENT_PUBLIC_ID = "U-0123456789ABCDEF";
const OTHER_PUBLIC_ID = "U-FEDCBA9876543210";

const urlPost = {
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174000",
  type: "GIVE",
  publisherId: OTHER_PUBLIC_ID,
  discount: 80,
  pieceNumber: 6,
  availablePayloadKinds: ["URL"],
  createdAt: "2027-01-15T08:00:00.000Z",
  expiresAt: "2027-01-16T08:00:00.000Z",
};

const requestPost = {
  ...urlPost,
  id: "p_1800000000000_123e4567-e89b-42d3-a456-426614174001",
  type: "REQUEST",
};

type ApiMockOptions = {
  post?: typeof urlPost;
  payloads?: { url: string };
  publishStatus?: number;
};

async function installApiMocks(
  page: Page,
  {
    post = urlPost,
    payloads = { url: GIVE_URL },
    publishStatus = 201,
  }: ApiMockOptions = {},
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
    if (publishStatus === 409) {
      await route.fulfill({
        status: 409,
        json: { error: { code: "DUPLICATE_POST" } },
      });
      return;
    }
    await route.fulfill({ status: publishStatus, json: { post } });
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
});

test("二维码发布和领取只提交并返回二维码链接", async ({ page }) => {
  const calls = await installApiMocks(page);
  const getCmccHeaders = await interceptCmccNavigation(page);

  await page.goto("/publish");
  await page.getByRole("button", { name: "赠送拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page
    .getByLabel("选择二维码图片")
    .setInputFiles(resolve("tests/fixtures/give-url-qr.png"));
  await expect(page.getByText("8折6号·赠送")).toBeVisible();
  await page.getByRole("button", { name: "发布" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => calls.publishBodies.length).toBe(1);
  const body = JSON.parse(calls.publishBodies[0]);
  expect(body).toMatchObject({
    type: "GIVE",
    sources: { url: GIVE_URL },
  });
  expect(body.sources.command).toBeUndefined();

  await page.getByRole("button", { name: "获取拼图" }).click();
  await page.getByRole("button", { name: "使用链接领取" }).click();
  await page.waitForURL((url) => url.hostname === "h.app.coc.10086.cn");
  const cmccHeaders = getCmccHeaders();
  expect(cmccHeaders["x-e2e-auth-token"]).toBeUndefined();
  expect(cmccHeaders.cookie ?? "").not.toContain(`${E2E_AUTH_COOKIE}=`);
  expect(calls.claim).toBe(1);
});

test("同一二维码重复发布被拦截", async ({ page }) => {
  const calls = await installApiMocks(page, { publishStatus: 409 });
  await page.goto("/publish");
  await page.getByRole("button", { name: "赠送拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page
    .getByLabel("选择二维码图片")
    .setInputFiles(resolve("tests/fixtures/give-url-qr.png"));
  await page.getByRole("button", { name: "发布" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "该二维码对应的拼图已经发布过了",
  );
  expect(calls.publishBodies).toHaveLength(1);
  expect(page).toHaveURL(/\/publish$/);
});

test("发布类型与二维码类型不一致时阻止发布", async ({ page }) => {
  const calls = await installApiMocks(page);
  await page.goto("/publish");
  await page.getByRole("button", { name: "求助拼图" }).click();
  await page.getByRole("radio", { name: "8折6号拼图" }).click();
  await page
    .getByLabel("选择二维码图片")
    .setInputFiles(resolve("tests/fixtures/give-url-qr.png"));

  await expect(page.getByRole("alert")).toHaveText(
    "选择的是求助，但内容识别为赠送，请更换内容或发布类型",
  );
  await expect(page.getByRole("button", { name: "发布" })).toBeDisabled();
  expect(calls.publishBodies).toHaveLength(0);
});

test("大厅求助帖使用二维码完成助力并等待确认", async ({ page }) => {
  const calls = await installApiMocks(page, {
    post: requestPost,
    payloads: { url: GIVE_URL },
  });
  const getCmccHeaders = await interceptCmccNavigation(page);
  await page.goto("/");

  await page.getByRole("button", { name: "去助力" }).click();
  await page.getByRole("button", { name: "使用链接助力" }).click();

  await expect(page.getByText("助力已提交，等待对方确认")).toBeVisible();
  expect(calls.help).toBe(1);
  expect(calls.claim).toBe(0);
  expect(getCmccHeaders()["x-e2e-auth-token"]).toBeUndefined();
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

test("大厅隐藏账户标识并为本人求助帖使用助力文案", async ({ page }) => {
  await installApiMocks(page, {
    post: { ...requestPost, publisherId: CURRENT_PUBLIC_ID },
    payloads: { url: GIVE_URL },
  });
  await page.goto("/");

  await expect(page.getByText("当前用户", { exact: true })).not.toBeVisible();
  await expect(
    page.getByText(`发布者 ${CURRENT_PUBLIC_ID}（我）`, { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "去助力" }).click();
  await expect(page.getByRole("button", { name: "使用链接助力" })).toBeVisible();
});

test("大厅、领取抽屉和发布页无横向溢出", async ({ page }) => {
  await installApiMocks(page);
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
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
