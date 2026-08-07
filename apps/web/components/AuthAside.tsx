export function AuthAside({ meta }: { meta: string }) {
  return (
    <aside className="auth-aside">
      <div className="auth-mark">PM Platform</div>
      <div className="auth-tagline">Work, tracked from create to report.</div>
      <div className="auth-meta">{meta}</div>
    </aside>
  );
}
