// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AccountPanel from '../src/components/AccountPanel';
import { setLanguage } from '../src/lib/language';
const calls = vi.hoisted(() => ({ signIn: vi.fn(), signup: vi.fn(), reset: vi.fn() }));
vi.mock('../src/lib/auth', () => ({ DEV_AUTH_ENABLED: false, FIREBASE_AUTH_ENABLED: true, EMULATOR_AUTH_ENABLED: false,
  DEV_ACCOUNTS: [], signInAccount: calls.signIn, createAccount: calls.signup, resetPassword: calls.reset }));
beforeEach(() => { setLanguage('en'); calls.signIn.mockReset(); calls.signup.mockReset(); calls.reset.mockReset(); });
afterEach(() => { cleanup(); setLanguage('en'); });
function fill() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SyntheticTestPassword!' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
}
it('shows the actionable Firebase credential error without hiding it behind a generic HTTP message', async () => {
  calls.signIn.mockRejectedValue({ code: 'auth/invalid-credential', message: 'Raw provider details should stay private' });
  const authenticated = vi.fn(); render(<AccountPanel onClose={vi.fn()} onAuthenticated={authenticated} />); fill();
  expect(await screen.findByText('Email or password is incorrect. Use your Manzil account password, or choose Forgot password.')).toBeTruthy();
  expect(screen.getByText('auth/invalid-credential')).toBeTruthy();
  expect(screen.queryByText('Raw provider details should stay private')).toBeNull();
  expect(authenticated).not.toHaveBeenCalled(); expect(calls.reset).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sign in' }).matches(':disabled')).toBe(false);
});
it('distinguishes a network failure from a rejected password', async () => {
  calls.signIn.mockRejectedValue({ code: 'auth/network-request-failed' });
  render(<AccountPanel onClose={vi.fn()} />); fill();
  expect(await screen.findByText('Could not reach the account service. Check your connection and try again.')).toBeTruthy();
});
it('never displays unknown provider payloads or arbitrary error codes', async () => {
  calls.signIn.mockRejectedValue({ code: 'auth/private-value-do-not-display', message: 'sensitive-token-or-request-data' });
  render(<AccountPanel onClose={vi.fn()} />); fill();
  expect(await screen.findByText('Could not sign in. Check your details and connection, then try again.')).toBeTruthy();
  expect(screen.queryByText(/private-value-do-not-display|sensitive-token-or-request-data/)).toBeNull();
});
it('keeps password recovery user-initiated and clears stale sign-in errors on switching screens', async () => {
  calls.signIn.mockRejectedValue({ code: 'auth/invalid-credential' }); calls.reset.mockResolvedValue(undefined);
  render(<AccountPanel onClose={vi.fn()} />); fill(); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.queryByRole('alert')).toBeNull(); expect(calls.reset).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('owner@example.test');
  fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }));
  await waitFor(() => expect(calls.reset).toHaveBeenCalledExactlyOnceWith('owner@example.test'));
  expect(await screen.findByText('Check your email for password reset instructions.')).toBeTruthy();
});
it('preserves successful login and uses the correct password-manager autocomplete mode', async () => {
  calls.signIn.mockResolvedValue(undefined); const done = vi.fn();
  render(<AccountPanel onClose={vi.fn()} onAuthenticated={done} />);
  expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password'); fill();
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
});
it('shows translated guidance while preserving the safe support code', async () => {
  setLanguage('ur'); calls.signIn.mockRejectedValue({ code: 'auth/invalid-credential' });
  const ui = render(<AccountPanel onClose={vi.fn()} />);
  const inputs = ui.baseElement.querySelectorAll('input');
  fireEvent.change(inputs[0], { target: { value: 'owner@example.test' } }); fireEvent.change(inputs[1], { target: { value: 'SyntheticTestPassword!' } });
  fireEvent.submit(ui.baseElement.querySelector('form')!);
  expect(await screen.findByText('auth/invalid-credential')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('منزل اکاؤنٹ کا پاس ورڈ');
});
