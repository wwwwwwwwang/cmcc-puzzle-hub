import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const playwrightCli = resolve(
  process.cwd(),
  "node_modules/@playwright/test/cli.js",
);

const playwrightArgs = process.argv.slice(2);
if (playwrightArgs[0] === "--") playwrightArgs.shift();

const child = spawn(
  process.execPath,
  [playwrightCli, "test", ...playwrightArgs],
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
