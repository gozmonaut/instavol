import { NextResponse, type NextRequest } from 'next/server';
import { isValidBasicAuth } from '@/lib/auth';

export default function proxy(request: NextRequest) {
  if (isValidBasicAuth(request)) return NextResponse.next();

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Instavol"' },
  });
}

export const config = {
  matcher: ['/((?!api/share|_next|favicon.ico|apple-icon|manifest.webmanifest).*)'],
};
