import { SessionGuard } from "@/components/session-guard";
import { Shell } from "@/components/shell";
import { context } from "@/lib/context";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await context();
  const companies = s.memberships.map((m) => ({
    id: m.company_id,
    name: (m.companies as unknown as { name: string })?.name ?? "Company",
  }));
  return (
    <Shell
      companies={companies}
      companyId={s.membership?.company_id}
      role={s.membership?.role}
      email={s.user.email}
      connected
    >
      <SessionGuard />
      {children}
    </Shell>
  );
}
