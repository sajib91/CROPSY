'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { EmptyState, LoadingState } from '@/components/ui';
import { canAccess } from '@/lib/auth/roles';

export function AssistantAccessGate({ dictionary, children }) {
  const { session, status } = useAuth();

  if (status === 'loading') {
    return <LoadingState label={dictionary.access.loading} />;
  }

  if (!canAccess(session, 'ai.read')) {
    return (
      <EmptyState
        title={dictionary.access.permissionTitle}
        description={dictionary.access.permissionLead}
      />
    );
  }

  return children;
}
