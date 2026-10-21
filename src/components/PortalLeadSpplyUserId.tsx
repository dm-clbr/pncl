import { Link } from 'react-router-dom';
import { useOwnLeadSpplyIntegration } from '@/hooks/useOwnLeadSpplyIntegration';

export default function PortalLeadSpplyUserId() {
  const { status, loading, error, reload } = useOwnLeadSpplyIntegration();
  return <div className="portal-profile-readonly">
    <span className="portal-field-label">LeadSpply user ID</span>
    {loading ? <p role="status">Loading…</p> : error ? <>
      <p role="status">Unable to load your LeadSpply user ID.</p>
      <button type="button" className="portal-inline-link" onClick={() => void reload()}>Try again</button>
    </> : status?.account?.leadspply_user_id ?
      <p style={{ overflowWrap: 'anywhere' }}>{status.account.leadspply_user_id}</p> :
      <p>{status?.state === 'not_linked' ? <Link to="/portal/leadspply">Connect LeadSpply</Link> : 'Not available'}</p>}
  </div>;
}
