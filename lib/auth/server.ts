import { createNeonAuth } from '@neon/auth/next/server';

// Neon Auth (managed Better Auth): accounts, sessions and the password-reset mail.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
