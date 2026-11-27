'use client';

import { SiteError } from '@/components/site/site-states';

export default function Error({ reset }) {
  return <SiteError reset={reset} />;
}
