import type { EnvCheckResult } from "../types/script";

interface EnvBadgeProps {
  envStatus: EnvCheckResult | null;
  loading: boolean;
}

export default function EnvBadge({ envStatus, loading }: EnvBadgeProps) {
  if (loading) {
    return <span className="env-badge env-badge-loading">Checking environment</span>;
  }

  if (envStatus == null) {
    return <span className="env-badge env-badge-idle">Not checked</span>;
  }

  if (envStatus.ok) {
    return <span className="env-badge env-badge-ok">Ready to run</span>;
  }

  return <span className="env-badge env-badge-error">Action required</span>;
}
