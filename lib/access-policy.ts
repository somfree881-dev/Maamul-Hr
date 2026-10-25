/** Exact public endpoints only; /login/anything and lookalike API prefixes stay protected. */
export function publicPath(path: string) {
  return (
    [
      "/login",
      "/forgot-password",
      "/reset-password",
      "/auth/callback",
      "/api/auth/login",
      "/logo.png",
      "/favicon.ico",
      "/sw.js",
      "/offline.html",
      "/app-icon.svg",
      "/manifest.webmanifest",
      "/icon",
      "/icon192",
    ].includes(path) ||
    path.startsWith("/_next/static/") ||
    path === "/_next/image"
  );
}
export function machinePath(path: string) {
  return path === "/api/connector" || path === "/api/jobs";
}
export const financeRoles = ["super_admin", "company_admin", "accountant"];
export const adminRoles = ["super_admin", "company_admin"];
export const attendanceRoles = [
  ...adminRoles,
  "hr_manager",
  "branch_manager",
  "supervisor",
];
