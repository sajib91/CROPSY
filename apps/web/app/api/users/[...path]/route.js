import { NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const VALID_SEGMENT = /^[A-Za-z0-9_-]+$/;

async function handle(request, { params }) {
  const { path: segments } = await params;
  if (!segments?.length || !segments.every((segment) => VALID_SEGMENT.test(segment))) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  return proxyApiRequest(request, {
    path: `/users/${segments.join('/')}`,
    search: new URL(request.url).search,
    setPurposeCookies: false,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
