import { NextResponse } from 'next/server';
import { clearAuthCookies, clearCookie, getPurposeToken, proxyApiRequest } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const VALID_SEGMENT = /^[A-Za-z0-9_-]+$/;

async function handle(request, { params }) {
  const { path: segments } = await params;
  if (!segments?.length || !segments.every((segment) => VALID_SEGMENT.test(segment))) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  const key = segments.join('/');
  const path = `/iam/auth/${key}`;
  const search = new URL(request.url).search;
  const clearOnSuccess = [];
  let injectBody;

  if (key === 'reset-password') {
    const token = getPurposeToken(request, 'reset');
    injectBody = (body) => (token && !body.resetToken ? { resetToken: token } : {});
    clearOnSuccess.push('reset');
  } else if (key === 'login/otp') {
    const token = getPurposeToken(request, 'login');
    injectBody = (body) => (token && !body.loginToken ? { loginToken: token } : {});
    clearOnSuccess.push('login');
  } else if (key === 'reactivate') {
    const token = getPurposeToken(request, 'recovery');
    injectBody = (body) => (token && !body.recoveryToken ? { recoveryToken: token } : {});
    clearOnSuccess.push('recovery');
  } else if (['logout', 'logout-all', 'deactivate'].includes(key)) {
    clearOnSuccess.push('auth');
  }

  const response = await proxyApiRequest(request, { path, search, injectBody });

  if (response.status < 400) {
    for (const kind of clearOnSuccess) {
      if (kind === 'auth') {
        clearAuthCookies(response, request);
      } else {
        const cookieName = {
          reset: 'cropsy_purpose_reset',
          login: 'cropsy_purpose_login',
          recovery: 'cropsy_purpose_recovery',
        }[kind];
        if (cookieName) clearCookie(response, cookieName, request);
      }
    }
  }

  return response;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
