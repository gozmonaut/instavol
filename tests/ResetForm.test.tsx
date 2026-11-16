// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetForm from '@/app/wachtwoord-herstellen/ResetForm';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));
const resetPassword = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/client', () => ({ authClient: { resetPassword } }));

const EXPIRED = 'Deze link is verlopen. Vraag een nieuwe aan.';

afterEach(() => {
  routerReplace.mockClear();
  resetPassword.mockReset();
});

async function fillIn(next: string, repeat: string) {
  await userEvent.type(screen.getByLabelText('Nieuw wachtwoord'), next);
  await userEvent.type(screen.getByLabelText('Herhaal nieuw wachtwoord'), repeat);
  await userEvent.click(screen.getByRole('button', { name: 'Wachtwoord opslaan' }));
}

test('saves the new password with the token from the link and says to sign in with it', async () => {
  resetPassword.mockResolvedValue({ data: { status: true }, error: null });
  render(<ResetForm token="reset-token" />);
  await fillIn('nieuw-wachtwoord', 'nieuw-wachtwoord');
  expect(resetPassword).toHaveBeenCalledWith({ newPassword: 'nieuw-wachtwoord', token: 'reset-token' });
  // A reset does not sign you in, so say so instead of sending you to a page that bounces to the login screen.
  expect(await screen.findByText('Je wachtwoord is gewijzigd. Log nu in met je nieuwe wachtwoord.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login');
  expect(screen.queryByLabelText('Nieuw wachtwoord')).not.toBeInTheDocument();
  expect(routerReplace).not.toHaveBeenCalled();
});

test('different passwords are caught before anything is sent', async () => {
  render(<ResetForm token="reset-token" />);
  await fillIn('nieuw-wachtwoord', 'iets-anders1');
  expect(screen.getByRole('alert')).toHaveTextContent('De wachtwoorden zijn niet gelijk');
  expect(resetPassword).not.toHaveBeenCalled();
});

test('a password shorter than 8 characters is caught before anything is sent', async () => {
  render(<ResetForm token="reset-token" />);
  await fillIn('1234567', '1234567');
  expect(screen.getByRole('alert')).toHaveTextContent('Wachtwoord moet minstens 8 tekens zijn');
  expect(resetPassword).not.toHaveBeenCalled();
});

test.each([[undefined], ['']])('without a token (%s) the link counts as expired and there is no form', (token) => {
  render(<ResetForm token={token} />);
  expect(screen.getByText(EXPIRED)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Nieuwe link aanvragen' })).toHaveAttribute('href', '/wachtwoord-vergeten');
  expect(screen.queryByLabelText('Nieuw wachtwoord')).not.toBeInTheDocument();
});

test.each([
  ['an error result', () => resetPassword.mockResolvedValue({ data: null, error: { status: 400, message: 'INVALID_TOKEN' } })],
  ['a thrown auth error', () => resetPassword.mockRejectedValue(Object.assign(new Error('INVALID_TOKEN'), { status: 400 }))],
])('a rejected token (%s) is shown as an expired link', async (_name, arrange) => {
  arrange();
  render(<ResetForm token="old-token" />);
  await fillIn('nieuw-wachtwoord', 'nieuw-wachtwoord');
  expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
  expect(routerReplace).not.toHaveBeenCalled();
});

test('an unavailable service is not reported as an expired link, and the form stays', async () => {
  resetPassword.mockResolvedValue({ data: null, error: { status: 503, message: 'x' } });
  render(<ResetForm token="reset-token" />);
  await fillIn('nieuw-wachtwoord', 'nieuw-wachtwoord');
  expect(await screen.findByRole('alert')).toHaveTextContent('Het lukt nu even niet, probeer het later opnieuw');
  expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nieuw wachtwoord')).toBeInTheDocument();
});

test('a failed connection keeps the form so you can try again', async () => {
  resetPassword.mockRejectedValue(new TypeError('Failed to fetch'));
  render(<ResetForm token="reset-token" />);
  await fillIn('nieuw-wachtwoord', 'nieuw-wachtwoord');
  expect(await screen.findByRole('alert')).toHaveTextContent('Geen verbinding, probeer het opnieuw');
  expect(screen.getByLabelText('Nieuw wachtwoord')).toBeInTheDocument();
});
