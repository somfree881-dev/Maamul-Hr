"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="panel empty">
      <h1>We couldn’t load this page</h1>
      <p>{error.message}</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
