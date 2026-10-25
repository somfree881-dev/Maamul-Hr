import { createHash, timingSafeEqual } from "node:crypto";
/** This module only runs on the server. Never accept a stored digest as a bearer key. */
export function connectorAuthenticated(
  header: string | null,
  storedHash: unknown,
) {
  const token = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(header ?? "")?.[1];
  if (
    !token ||
    typeof storedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(storedHash)
  )
    return false;
  const digest = createHash("sha256").update(token, "utf8").digest();
  return timingSafeEqual(digest, Buffer.from(storedHash, "hex"));
}
