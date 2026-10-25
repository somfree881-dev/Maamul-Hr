import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
await mkdir(resolve(".preview"), { recursive: true });
const profile = await mkdtemp(resolve(".preview/chrome-auth-"));
const chrome = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket,
  seq = 0;
const pending = new Map();
function call(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error("Browser evaluation failed");
  return response.result.value;
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(resolve(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await sleep(100);
    }
  }
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
    (response) => response.json(),
  );
  socket = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve) =>
    socket.addEventListener("open", resolve, { once: true }),
  );
  socket.addEventListener("message", (event) => {
    const response = JSON.parse(event.data);
    if (response.id && pending.has(response.id)) {
      const task = pending.get(response.id);
      pending.delete(response.id);
      response.error
        ? task.reject(new Error(response.error.message))
        : task.resolve(response.result);
    }
  });
  await call("Page.enable");
  for (const width of [1440, 390]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 950,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    for (const path of [
      "/",
      "/manage/employees",
      "/manage/payroll",
      "/reports",
      "/settings",
    ]) {
      await call("Page.navigate", { url: "http://localhost:3000" + path });
      await sleep(250);
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (
          await evaluate(
            "location.pathname==='/login'&&document.readyState==='complete'&&!!document.querySelector('input[type=password]')",
          )
        ) {
          ready = true;
          break;
        }
        await sleep(100);
      }
      assert.ok(ready, "Protected URL did not reach login: " + path);
      assert.equal(
        await evaluate(
          "!!document.querySelector('.app-shell,.sidebar,.mobile-bottom-nav')",
        ),
        false,
        "Protected navigation leaked",
      );
      assert.ok(
        await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
        "Login horizontal overflow",
      );
      await call("Page.reload");
      await sleep(300);
      assert.equal(
        await evaluate("!!document.querySelector('.app-shell,.sidebar')"),
        false,
      );
      console.log(
        `PASS Chrome ${width}px direct URL and refresh: ${path} -> login only`,
      );
    }
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(
      `.preview/security-login-${width}.png`,
      Buffer.from(shot.data, "base64"),
    );
  }
} finally {
  if (socket?.readyState === 1) {
    try {
      await call("Browser.close");
    } catch {}
    socket.close();
  } else chrome.kill();
}
