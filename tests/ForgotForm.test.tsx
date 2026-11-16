// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotForm from '@/app/wachtwoord-vergeten/ForgotForm';

const requestPasswordReset = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/client', () => ({ authClient: { requestPasswordReset } }));

const CONFIRMATION =
  'Als dit adres bij ons bekend is, staat er een mail met een herstellink in je inbox. De link is 15 minuten geldig.';

afterEach(() => {
  requestPasswordReset.mockReset();
});

async function submit() {
  await userEvent.type(screen.getByLabelText('E-mailadres'), 'oma@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Stuur herstellink' }));
}

test('asks for a reset link that leads to the reset screen', async () => {
  requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
  render(<ForgotForm />);
  await submit();
  expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'oma@example.com', redirectTo: '/wachtwoord-herstellen' });
  expect(await screen.findByText(CONFIRMATION)).toBeInTheDocument();
});

test.each([
  ['an error result', () => requestPasswordReset.mockResolvedValue({ data: null, error: { status: 400, message: 'User not found' } })],
  ['a thrown auth error', () => requestPasswordReset.mockRejectedValue(Object.assign(new Error('User not found'), { status: 400 }))],
])('an unknown address (%s) gets the same confirmation, so it does not reveal who has an account', async (_name, arrange) => {
  arrange();
  render(<ForgotForm />);
  await submit();
  expect(await screen.findByText(CONFIRMATION)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a failed connection is reported, without the confirmation', async () => {
  requestPasswordReset.mockRejectedValue(new TypeError('Failed to fetch'));
  render(<ForgotForm />);
  await submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Geen verbinding, probeer het opnieuw');
  expect(screen.queryByText(CONFIRMATION)).not.toBeInTheDocument();
});

test('links back to signing in', () => {
  render(<ForgotForm />);
  expect(screen.getByRole('link', { name: 'Terug naar inloggen' })).toHaveAttribute('href', '/login');
});
