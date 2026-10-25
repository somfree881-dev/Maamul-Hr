export default function AuthenticationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      className="public-auth-layout"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      {children}
    </main>
  );
}
