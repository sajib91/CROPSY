import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env = getWebEnv();

  return NextResponse.json({
    success: true,
    data: {
      status: 'ok',
      service: 'cropsy-web',
      apiUrl: env.NEXT_PUBLIC_API_URL,
      timestamp: new Date().toISOString(),
    },
  });
}
