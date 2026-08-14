import { Callout } from "../components/ui/Callout";

export default function NotFound() {
  return (
    <div className="auth">
      <div className="auth-panel"><div className="auth-panel-inner">
        <h1 className="ui-static-881f70f9">Page not found</h1>
        <Callout tone="info">The page you asked for does not exist or has moved.</Callout>
        <a className="btn btn-primary btn-block ui-static-1b0f4999" href="/home">Back to home</a>
      </div></div>
    </div>
  );
}
