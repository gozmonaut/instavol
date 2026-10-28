import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

export default async function proxy(request: NextRequest) {
  const loggedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    return loggedIn ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (loggedIn) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

// api/share uses its own bearer token; the login page, its artwork and the home-screen files must be public.
export const config = {
  matcher: [
    '/((?!api/share|api/login|_next|favicon.ico|apple-icon|manifest.webmanifest|instavol-icon.svg|instavol-logo-).*)',
  ],
};
