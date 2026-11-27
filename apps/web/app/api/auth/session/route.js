import { NextResponse } from 'next/server';
import { hasAuthCookie, hasPurposeCookie, proxyApiRequest } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const hasRefresh = hasAuthCookie(request, 'refresh');
  const base = {
    authenticated: false,
    hasRefresh,
    hasResetPurpose: hasPurposeCookie(request, 'reset'),
  };

  if (!hasAuthCookie(request, 'access')) {
    return NextResponse.json({ success: true, data: base });
  }

  const response = await proxyApiRequest(request, {
    path: '/iam/auth/me',
    setPurposeCookies: false,
  });

  if (response.status >= 400) return NextResponse.json({ success: true, data: base });

  const payload = await response.json();
  if (payload?.success !== true) return NextResponse.json({ success: true, data: base });

  return NextResponse.json({
    success: true,
    data: { ...base, authenticated: true, ...payload.data },
  });
}
