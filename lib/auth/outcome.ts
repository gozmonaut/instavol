export type AuthOutcome = 'ok' | 'rejected' | 'offline';

// The auth client reports a refusal either as an `error` in its result or by throwing an error that
// carries the HTTP status; anything else that is thrown means the request never got an answer.
export async function authOutcome(call: () => Promise<{ error?: unknown } | null | undefined>): Promise<AuthOutcome> {
  try {
    const result = await call();
    return result?.error ? 'rejected' : 'ok';
  } catch (thrown) {
    return typeof thrown === 'object' && thrown !== null && 'status' in thrown ? 'rejected' : 'offline';
  }
}
