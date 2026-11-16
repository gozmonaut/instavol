// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '@/app/login/LoginForm';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));
const signInEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/client', () => ({ authClient: { signIn: { email: signInEmail } } }));

afterEach(() => {
  routerReplace.mockClear();
  signInEmail.mockReset();
});

async function signIn(password: string) {
  await userEvent.type(screen.getByLabelText('E-mailadres'), 'oma@example.com');
  await userEvent.type(screen.getByLabelText('Wachtwoord'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Inloggen' }));
}

test('signs in with e-mail address and password and opens the app', async () => {
  signInEmail.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
  render(<LoginForm />);
  await signIn('geheim-wachtwoord');
  expect(signInEmail).toHaveBeenCalledWith({ email: 'oma@example.com', password: 'geheim-wachtwoord' });
  expect(routerReplace).toHaveBeenCalledWith('/');
});

test.each([
  ['an error result', () => signInEmail.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid email or password' } })],
  ['a thrown auth error', () => signInEmail.mockRejectedValue(Object.assign(new Error('Invalid email or password'), { status: 401 }))],
])('rejected sign-in (%s) shows an error and clears the password', async (_name, arrange) => {
  arrange();
  render(<LoginForm />);
  await signIn('fout');
  expect(await screen.findByRole('alert')).toHaveTextContent('Onjuist e-mailadres of wachtwoord');
  expect(screen.getByLabelText('Wachtwoord')).toHaveValue('');
  expect(routerReplace).not.toHaveBeenCalled();
});

test('an unavailable service is not reported as a wrong password', async () => {
  signInEmail.mockResolvedValue({ data: null, error: { status: 503, message: 'x' } });
  render(<LoginForm />);
  await signIn('geheim-wachtwoord');
  expect(await screen.findByRole('alert')).toHaveTextContent('Het lukt nu even niet, probeer het later opnieuw');
});

test('a failed connection is not reported as a wrong password', async () => {
  signInEmail.mockRejectedValue(new TypeError('Failed to fetch'));
  render(<LoginForm />);
  await signIn('geheim-wachtwoord');
  expect(await screen.findByRole('alert')).toHaveTextContent('Geen verbinding, probeer het opnieuw');
});

test('links to signing up and to resetting a forgotten password', () => {
  render(<LoginForm />);
  expect(screen.getByRole('link', { name: 'Account aanmaken' })).toHaveAttribute('href', '/registreren');
  expect(screen.getByRole('link', { name: 'Wachtwoord vergeten?' })).toHaveAttribute('href', '/wachtwoord-vergeten');
});

test('the fields support iOS password autofill', () => {
  render(<LoginForm />);
  expect(screen.getByLabelText('E-mailadres')).toHaveAttribute('autocomplete', 'username');
  expect(screen.getByLabelText('Wachtwoord')).toHaveAttribute('autocomplete', 'current-password');
});
