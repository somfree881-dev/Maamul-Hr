/** A previous successful sync is not proof the connector is still running. */
export function deviceConnectionLabel(
  lastSync: string | null,
  now = Date.now(),
) {
  if (!lastSync) return "Awaiting first successful sync";
  const stamp = Date.parse(lastSync);
  if (!Number.isFinite(stamp) || stamp > now + 60_000)
    return "Check device synchronization time";
  return now - stamp > 15 * 60_000
    ? "No recent sync — check connector/network"
    : "Connected — recently synchronized";
}
