'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { canAccess } from '@/lib/auth/roles';
import { EmptyState, LoadingState } from '@/components/ui';

export function MarketplaceAccessGate({ permission, dictionary, children }) {
  const { session, status } = useAuth();

  if (status === 'loading') {
    return <LoadingState label={dictionary.common.loading} />;
  }

  if (!canAccess(session, permission)) {
    return (
      <EmptyState
        title={dictionary.access.permissionTitle}
        description={dictionary.access.permissionLead}
      />
    );
  }

  return children;
}
