import { fileURLToPath } from "node:url";
import qrcode from "qrcode";

const GIVE_URL =
  "https://h.app.coc.10086.cn/activity/zx/transit/transferDownload.html?targetUrl=https%3A%2F%2Fwx.10086.cn%2Fhlwyxhdhub%2Fact-wedrecharge%2F1024101716%3FgiveCard%3De728c7fc81f771f07c0491ee1afeac6c602855ea6c6ff236550705d032fa902eec43f56ac39454c76f35cef683460bb4&pageId=99992603311033047&channelId=P00000116211&sellerId=1636941HD1301000012";
const outputPath = fileURLToPath(
  new URL("../tests/fixtures/give-url-qr.png", import.meta.url),
);

await qrcode.toFile(outputPath, GIVE_URL, { width: 512, margin: 2 });
console.log(`Generated ${outputPath}`);
