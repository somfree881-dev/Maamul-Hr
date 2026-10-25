import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import manifest from "../app/manifest";

function serviceWorker(fetcher: ReturnType<typeof vi.fn>) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const match = vi.fn(async () => new Response("Public offline page"));
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://maamul.test" },
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        handlers[type] = handler;
      },
    },
    URL,
    fetch: fetcher,
    caches: { match },
  });
  return { handlers, match };
}
it("does not intercept API or client data requests for offline storage", () => {
  const fetcher = vi.fn();
  const { handlers, match } = serviceWorker(fetcher);
  const respondWith = vi.fn();
  for (const request of [
    { url: "https://maamul.test/api/export", method: "GET", mode: "navigate" },
    {
      url: "https://maamul.test/manage/employees?_rsc=1",
      method: "GET",
      mode: "cors",
    },
    {
      url: "https://maamul.test/api/records/employees",
      method: "POST",
      mode: "cors",
    },
  ])
    handlers.fetch({ request, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(match).not.toHaveBeenCalled();
});
it("uses network for authenticated pages and only a public fallback offline", async () => {
  const fetcher = vi.fn(async () => new Response("Private page"));
  const { handlers, match } = serviceWorker(fetcher);
  let result: Promise<Response> | undefined;
  const event = {
    request: {
      url: "https://maamul.test/manage/payroll",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (response: Promise<Response>) => {
      result = response;
    },
  };
  handlers.fetch(event);
  expect(await (await result!).text()).toBe("Private page");
  expect(match).not.toHaveBeenCalled();
  fetcher.mockRejectedValueOnce(new Error("offline"));
  handlers.fetch(event);
  expect(await (await result!).text()).toBe("Public offline page");
  expect(match).toHaveBeenCalledWith("/offline.html");
});
it("provides standalone installation with employee, attendance, payroll and report shortcuts", () => {
  const app = manifest();
  expect(app.display).toBe("standalone");
  expect(app.shortcuts?.map((shortcut) => shortcut.url)).toEqual([
    "/manage/employees",
    "/manage/attendance",
    "/manage/payroll",
    "/reports",
  ]);
  expect(app.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
  expect(app.icons?.some((icon) => icon.sizes === "512x512")).toBe(true);
});
