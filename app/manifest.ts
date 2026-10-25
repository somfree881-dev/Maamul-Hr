import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Maamul HR",
    short_name: "Maamul",
    description: "Employees, branch attendance, payroll and reports.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f8fa",
    theme_color: "#142b42",
    icons: [
      { src: "/icon192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Employees", url: "/manage/employees" },
      { name: "Attendance", url: "/manage/attendance" },
      { name: "Payroll", url: "/manage/payroll" },
      { name: "Reports", url: "/reports" },
    ],
  };
}
