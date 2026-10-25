import { createHash, randomBytes } from "node:crypto";
import { it, expect } from "vitest";
import { connectorAuthenticated } from "../lib/connector-auth";
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
it("authenticates only the raw per-device credential, never its digest", () => {
  const key = randomBytes(48).toString("base64url");
  expect(connectorAuthenticated(`Bearer ${key}`, hash(key))).toBe(true);
  expect(connectorAuthenticated(`Bearer ${hash(key)}`, hash(key))).toBe(false);
  expect(
    connectorAuthenticated(
      `Bearer ${key}`,
      hash(randomBytes(48).toString("base64url")),
    ),
  ).toBe(false);
});
it("revokes the previous credential on immediate key rotation", () => {
  const previous = randomBytes(48).toString("base64url"),
    current = randomBytes(48).toString("base64url");
  expect(connectorAuthenticated(`Bearer ${previous}`, hash(current))).toBe(
    false,
  );
  expect(connectorAuthenticated(`Bearer ${current}`, hash(current))).toBe(true);
});
it("rejects malformed, missing, oversized tokens and invalid stored hashes", () => {
  for (const header of [
    null,
    "",
    "Basic key",
    "Bearer short",
    `Bearer ${"a".repeat(129)}`,
    `Bearer ${"a".repeat(64)} extra`,
  ])
    expect(connectorAuthenticated(header, "a".repeat(64))).toBe(false);
  expect(connectorAuthenticated(`Bearer ${"a".repeat(64)}`, "malformed")).toBe(
    false,
  );
});
