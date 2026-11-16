import { auth } from '@/lib/auth/server';

// Passes the browser's auth calls on to Neon Auth.
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
