const uuid =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export const technicalField = (key: string) =>
  key === "id" ||
  key.endsWith("_id") ||
  [
    "created_at",
    "updated_at",
    "received_at",
    "connector_key_hash",
    "storage_path",
    "photo_path",
    "source_key",
    "changed_fields",
    "uploaded_by",
    "approved_by",
    "requested_by",
    "reviewed_by",
    "recorded_by",
    "generated_by",
  ].includes(key);
export const displayLabel = (key: string) =>
  (
    ({ phone: "Phone Number", district: "Residential District" }) as Record<
      string,
      string
    >
  )[key] ??
  key
    .replace(/_id$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object")
    return Object.entries(value)
      .filter(([key]) => !technicalField(key))
      .map(([key, v]) => `${displayLabel(key)}: ${displayValue(v)}`)
      .join("; ");
  const text = String(value).replace(uuid, "[internal reference]");
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        ...(/T/.test(text) ? { timeStyle: "short" as const } : {}),
        timeZone: "Africa/Mogadishu",
      }).format(date);
  }
  return text;
}
export function cleanRecord(row: Record<string, unknown>) {
  const fullName = [row.first_name, row.middle_name, row.last_name]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => String(part).trim())
    .join(" ");
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !technicalField(key))
      .filter(
        ([key]) => !fullName || !["middle_name", "last_name"].includes(key),
      )
      .map(([key, val]) =>
        key === "first_name" && fullName ? ["full_name", fullName] : [key, val],
      )
      .map(([key, val]) => [
        key,
        typeof val === "number" ? val : displayValue(val),
      ]),
  );
}
