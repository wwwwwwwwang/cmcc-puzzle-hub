import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("无法定位 pnpm CLI，请通过 pnpm test:e2e 运行 E2E");
}

const playwrightArgs = process.argv.slice(2);
if (playwrightArgs[0] === "--") playwrightArgs.shift();

const child = spawn(
  process.execPath,
  [pnpmCli, "exec", "playwright", "test", ...playwrightArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_TEST_AUTH_TOKEN: randomBytes(32).toString("hex"),
    },
  },
);

child.on("error", (error) => {
  console.error("启动 Playwright E2E 失败", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
