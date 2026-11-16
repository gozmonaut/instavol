// Who the mocked '@/lib/currentUser' (see tests/setup.ts) says is signed in. Tests start as 'user-a'.
export const currentUser: { id: string | null; sessionId: string | null } = { id: 'user-a', sessionId: 'user-a' };

// null = signed out. Pass { member: false } for an account that signed in but was never invited.
export function signInAs(userId: string | null, options: { member?: boolean } = {}): void {
  currentUser.sessionId = userId;
  currentUser.id = options.member === false ? null : userId;
}
