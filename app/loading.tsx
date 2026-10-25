export default function Loading() {
  return (
    <section className="workspace-loading" role="status" aria-live="polite">
      <h1>Loading workspace…</h1>
      <p>Retrieving your company records.</p>
      <div className="loading-cards" aria-hidden="true">
        <div />
        <div />
        <div />
      </div>
    </section>
  );
}
