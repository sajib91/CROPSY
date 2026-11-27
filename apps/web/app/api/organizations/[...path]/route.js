import { NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const VALID_SEGMENT = /^[A-Za-z0-9_-]+$/;

async function handle(request, { params }) {
  const { path: segments } = await params;
  const key = Array.isArray(segments) ? segments.join('/') : '';

  if (request.method !== 'POST') {
    return NextResponse.json({ success: false, error: 'method_not_allowed' }, { status: 405 });
  }
  if (
    key !== 'switch' ||
    !Array.isArray(segments) ||
    segments.length !== 1 ||
    !VALID_SEGMENT.test(segments[0])
  ) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  return proxyApiRequest(request, {
    path: '/organizations/switch',
    setPurposeCookies: false,
  });
}

export const POST = handle;
