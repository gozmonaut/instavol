export type AuthOutcome = 'ok' | 'rejected' | 'unavailable' | 'offline';

export const MESSAGE_OFFLINE = 'Geen verbinding, probeer het opnieuw';
export const MESSAGE_UNAVAILABLE = 'Het lukt nu even niet, probeer het later opnieuw';

// A refusal because of what the user entered is 4xx; 429 (too many requests) and 5xx mean the service is
// the problem, which must not be shown as a wrong password, an unknown address or an expired link.
function classify(status: unknown): 'rejected' | 'unavailable' {
  return typeof status === 'number' && (status === 429 || status >= 500) ? 'unavailable' : 'rejected';
}

// The auth client reports a refusal either as an `error` in its result or by throwing an error that
// carries the HTTP status; anything else that is thrown means the request never got an answer.
export async function authOutcome(call: () => Promise<{ error?: unknown } | null | undefined>): Promise<AuthOutcome> {
  try {
    const result = await call();
    if (!result?.error) return 'ok';
    return classify((result.error as { status?: unknown }).status);
  } catch (thrown) {
    if (typeof thrown === 'object' && thrown !== null && 'status' in thrown) {
      return classify((thrown as { status?: unknown }).status);
    }
    return 'offline';
  }
}

// What to tell the user when the request failed for a reason that is not about their input.
export function failureMessage(outcome: 'unavailable' | 'offline'): string {
  return outcome === 'unavailable' ? MESSAGE_UNAVAILABLE : MESSAGE_OFFLINE;
}
