import PortalAuthLayout from "./PortalAuthLayout";

export default function PortalAuthUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PortalAuthLayout>
      <div role="alert">
        <h1 className="pauth-title">Having trouble connecting</h1>
        <p className="pauth-lede">{message}</p>
      </div>
      <div className="pauth-actions">
        <button type="button" className="pauth-btn is-primary" onClick={onRetry}>Try again</button>
      </div>
    </PortalAuthLayout>
  );
}
