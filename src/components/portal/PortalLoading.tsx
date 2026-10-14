import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Skeleton from "@/components/portal/Skeleton";

/** Auth and role resolution use the same theme as the destination portal. */
export default function PortalLoading() {
  return (
    <PortalAuthLayout>
      <div className="pauth-loading" role="status" aria-busy="true" aria-label="Loading portal">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="text" width="62%" />
        <Skeleton variant="row" />
        <span className="portal-sr">Loading portal</span>
      </div>
    </PortalAuthLayout>
  );
}
