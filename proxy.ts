import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

const LOGIN_URL = '/login';

// Neon Auth checks the session; without one, pages go to the login screen.
// /geen-toegang is not listed: it is for accounts that are signed in but were never invited.
const guard = auth.middleware({
  loginUrl: LOGIN_URL,
  publicRoutes: [LOGIN_URL, '/registreren', '/wachtwoord-vergeten', '/wachtwoord-herstellen'],
});

export default async function proxy(request: NextRequest) {
  const response = await guard(request);

  // An API call should hear "not signed in", not be sent to a login page.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const location = response.headers.get('location');
    if (location && new URL(location, request.url).pathname === LOGIN_URL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return response;
}

// api/share uses the user's own share token; the artwork and the home-screen files must be public.
export const config = {
  matcher: [
    '/((?!api/share(?:/|$)|_next|favicon.ico|apple-icon|manifest.webmanifest|instavol-icon.svg|instavol-logo-).*)',
  ],
};
