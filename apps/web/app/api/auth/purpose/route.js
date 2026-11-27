import { NextResponse } from 'next/server';
import { hasPurposeCookie } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return NextResponse.json({
    success: true,
    data: {
      reset: hasPurposeCookie(request, 'reset'),
      login: hasPurposeCookie(request, 'login'),
      recovery: hasPurposeCookie(request, 'recovery'),
    },
  });
}
