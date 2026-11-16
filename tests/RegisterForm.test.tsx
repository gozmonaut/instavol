// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from '@/app/registreren/RegisterForm';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));
const register = vi.hoisted(() => vi.fn());
vi.mock('@/app/registreren/actions', () => ({ register }));

afterEach(() => {
  routerReplace.mockClear();
  register.mockReset();
});

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Naam'), 'Oma');
  await userEvent.type(screen.getByLabelText('E-mailadres'), 'oma@example.com');
  await userEvent.type(screen.getByLabelText('Wachtwoord'), 'lang-genoeg');
  await userEvent.type(screen.getByLabelText('Uitnodigingscode'), 'familie-2026');
  await userEvent.click(screen.getByRole('button', { name: 'Account aanmaken' }));
}

test('sends what was filled in and opens the app', async () => {
  register.mockResolvedValue({ ok: true });
  render(<RegisterForm />);
  await fillAndSubmit();
  expect(register).toHaveBeenCalledWith({
    name: 'Oma',
    email: 'oma@example.com',
    password: 'lang-genoeg',
    inviteCode: 'familie-2026',
  });
  expect(routerReplace).toHaveBeenCalledWith('/');
});

test('shows why signing up failed and stays on the form', async () => {
  register.mockResolvedValue({ ok: false, error: 'Uitnodigingscode klopt niet' });
  render(<RegisterForm />);
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Uitnodigingscode klopt niet');
  expect(routerReplace).not.toHaveBeenCalled();
});

test('shows a connection error when the request itself fails', async () => {
  register.mockRejectedValue(new Error('network'));
  render(<RegisterForm />);
  await fillAndSubmit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Geen verbinding, probeer het opnieuw');
});

test('links back to signing in and supports password managers', () => {
  render(<RegisterForm />);
  expect(screen.getByRole('link', { name: 'Al een account? Inloggen' })).toHaveAttribute('href', '/login');
  expect(screen.getByLabelText('Wachtwoord')).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByLabelText('E-mailadres')).toHaveAttribute('autocomplete', 'email');
});
