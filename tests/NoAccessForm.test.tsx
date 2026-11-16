// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoAccessForm from '@/app/geen-toegang/NoAccessForm';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));
const joinWithInviteCode = vi.hoisted(() => vi.fn());
vi.mock('@/app/registreren/actions', () => ({ joinWithInviteCode }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/client', () => ({ authClient: { signOut } }));

afterEach(() => {
  routerReplace.mockClear();
  joinWithInviteCode.mockReset();
  signOut.mockReset();
});

test('explains that an invite code is needed', () => {
  render(<NoAccessForm />);
  expect(screen.getByText('Dit account heeft nog geen toegang. Je hebt een uitnodigingscode nodig.')).toBeInTheDocument();
});

test('the right code opens the app', async () => {
  joinWithInviteCode.mockResolvedValue({ ok: true });
  render(<NoAccessForm />);
  await userEvent.type(screen.getByLabelText('Uitnodigingscode'), 'familie-2026');
  await userEvent.click(screen.getByRole('button', { name: 'Doorgaan' }));
  expect(joinWithInviteCode).toHaveBeenCalledWith('familie-2026');
  expect(routerReplace).toHaveBeenCalledWith('/');
});

test('a wrong code shows the reason and stays put', async () => {
  joinWithInviteCode.mockResolvedValue({ ok: false, error: 'Uitnodigingscode klopt niet' });
  render(<NoAccessForm />);
  await userEvent.type(screen.getByLabelText('Uitnodigingscode'), 'geraden');
  await userEvent.click(screen.getByRole('button', { name: 'Doorgaan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Uitnodigingscode klopt niet');
  expect(routerReplace).not.toHaveBeenCalled();
});

test('signing out goes back to the login screen, also when the request fails', async () => {
  signOut.mockRejectedValue(new Error('network'));
  render(<NoAccessForm />);
  await userEvent.click(screen.getByRole('button', { name: 'Uitloggen' }));
  expect(signOut).toHaveBeenCalled();
  expect(routerReplace).toHaveBeenCalledWith('/login');
});
