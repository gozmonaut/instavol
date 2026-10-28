// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '@/app/login/LoginForm';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));

afterEach(() => {
  routerReplace.mockClear();
});

test('submits the credentials to /api/login and opens the app', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText('Gebruikersnaam'), 'Volkan');
  await userEvent.type(screen.getByLabelText('Wachtwoord'), 'geheim');
  await userEvent.click(screen.getByRole('button', { name: 'Inloggen' }));
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/login',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'Volkan', password: 'geheim' }) }),
  );
  expect(routerReplace).toHaveBeenCalledWith('/');
});

test('shows an error and clears the password when the login is rejected', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText('Gebruikersnaam'), 'Volkan');
  await userEvent.type(screen.getByLabelText('Wachtwoord'), 'fout');
  await userEvent.click(screen.getByRole('button', { name: 'Inloggen' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Onjuiste gebruikersnaam of wachtwoord');
  expect(screen.getByLabelText('Wachtwoord')).toHaveValue('');
  expect(routerReplace).not.toHaveBeenCalled();
});

test('the fields support iOS password autofill', () => {
  render(<LoginForm />);
  expect(screen.getByLabelText('Gebruikersnaam')).toHaveAttribute('autocomplete', 'username');
  expect(screen.getByLabelText('Wachtwoord')).toHaveAttribute('autocomplete', 'current-password');
});
