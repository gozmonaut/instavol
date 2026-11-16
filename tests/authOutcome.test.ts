import { authOutcome } from '@/lib/auth/outcome';

test('no error is ok', async () => {
  expect(await authOutcome(async () => ({ error: null }))).toBe('ok');
  expect(await authOutcome(async () => undefined)).toBe('ok');
});

test.each([400, 401, 403, 422])('an error result with status %i is a refusal', async (status) => {
  expect(await authOutcome(async () => ({ error: { status } }))).toBe('rejected');
});

test.each([429, 500, 502, 503])('an error result with status %i means the service is unavailable, not that the input was wrong', async (status) => {
  expect(await authOutcome(async () => ({ error: { status } }))).toBe('unavailable');
});

test('a thrown error carrying a status is judged the same way', async () => {
  expect(await authOutcome(async () => { throw Object.assign(new Error('x'), { status: 401 }); })).toBe('rejected');
  expect(await authOutcome(async () => { throw Object.assign(new Error('x'), { status: 503 }); })).toBe('unavailable');
});

test('a thrown error without a status means no connection', async () => {
  expect(await authOutcome(async () => { throw new TypeError('Failed to fetch'); })).toBe('offline');
});

test('an error result without a status counts as a refusal', async () => {
  expect(await authOutcome(async () => ({ error: { message: 'nope' } }))).toBe('rejected');
});
