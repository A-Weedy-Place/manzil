// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordResetPage from '../src/components/PasswordResetPage';
import { hostedEmailActionUrl, passwordResetProblem, readEmailAction, type EmailActionRequest } from '../src/lib/emailActions';

const auth = vi.hoisted(() => ({ verify: vi.fn(), complete: vi.fn() }));
vi.mock('../src/lib/auth', () => ({ FIREBASE_AUTH_ENABLED: true, verifyAccountPasswordReset: auth.verify, completeAccountPasswordReset: auth.complete }));
const request: EmailActionRequest = { mode: 'resetPassword', code: 'synthetic-code', language: 'en' };
beforeEach(() => { vi.resetAllMocks(); auth.verify.mockResolvedValue('synthetic@manzil.test'); auth.complete.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });
async function open() { render(<PasswordResetPage request={request} />); await screen.findByLabelText('New password'); }
function fill(password = 'SyntheticNew123!', repeated = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Re-enter password'), { target: { value: repeated } });
  fireEvent.submit(screen.getByRole('form', { name: 'Choose a new password' }));
}

describe('branded reset handler', () => {
  it('verifies before showing password inputs and ignores unmounted/obsolete link results', async () => {
    let finish!: (email: string) => void;
    auth.verify.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    const { rerender } = render(<PasswordResetPage request={request} />);
    expect(screen.queryByLabelText('New password')).toBeNull(); expect(screen.getByRole('status').textContent).toMatch(/Checking/);
    rerender(<PasswordResetPage request={{ ...request, code: 'different-code' }} />);
    await screen.findByLabelText('New password');
    finish('obsolete@manzil.test'); await Promise.resolve();
    expect(screen.queryByText('obsolete@manzil.test')).toBeNull(); expect(screen.getByText('synthetic@manzil.test')).toBeTruthy();
    expect(auth.complete).not.toHaveBeenCalled();
  });

  it('validates confirmation locally, focuses the field and makes no reset request', async () => {
    await open(); fill('SyntheticNew123!', 'different');
    expect(screen.getByRole('alert').textContent).toBe('The passwords do not match.');
    expect(document.activeElement).toBe(screen.getByLabelText('Re-enter password'));
    expect(screen.getByLabelText('Re-enter password').getAttribute('aria-invalid')).toBe('true');
    expect(auth.complete).not.toHaveBeenCalled();
    fill('short'); expect(screen.getByRole('alert').textContent).toBe('Use at least 6 characters.');
    expect(document.activeElement).toBe(screen.getByLabelText('New password')); expect(auth.complete).not.toHaveBeenCalled();
  });

  it('supports separate visible passwords, password managers and a single in-flight confirmation', async () => {
    let finish!: () => void; auth.complete.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await open(); const password = screen.getByLabelText('New password');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password · New password' }));
    expect(password).toHaveProperty('type', 'text'); expect(screen.getByLabelText('Re-enter password')).toHaveProperty('type', 'password');
    fill(); fireEvent.submit(screen.getByRole('form', { name: 'Choose a new password' }));
    expect(auth.complete).toHaveBeenCalledExactlyOnceWith('synthetic-code', 'SyntheticNew123!');
    expect(screen.getByRole('form').getAttribute('aria-busy')).toBe('true');
    finish(); await screen.findByRole('heading', { name: 'Password updated' });
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/');
    expect(window.location.pathname).toBe('/account/action'); expect(window.location.search).toBe('');
  });

  it('shows used/expired links without exposing provider payloads or letting the user submit', async () => {
    auth.verify.mockRejectedValue({ code: 'auth/expired-action-code', message: 'secret-payload' });
    render(<PasswordResetPage request={request} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired or has already been used/);
    expect(screen.queryByLabelText('New password')).toBeNull(); expect(screen.queryByText('secret-payload')).toBeNull();
    expect(auth.complete).not.toHaveBeenCalled();
  });

  it('allows retrying a transient verification failure without requesting another email', async () => {
    auth.verify.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    render(<PasswordResetPage request={request} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByLabelText('New password'); expect(auth.verify).toHaveBeenCalledTimes(2); expect(auth.complete).not.toHaveBeenCalled();
  });

  it('retains editable fields after server password-policy rejection and clears secrets after a used-code race', async () => {
    auth.complete.mockRejectedValueOnce({ code: 'auth/password-does-not-meet-requirements' });
    await open(); fill();
    expect((await screen.findByRole('alert')).textContent).toMatch(/stronger password/);
    expect(screen.getByLabelText('New password')).toHaveProperty('value', 'SyntheticNew123!');
    auth.complete.mockRejectedValueOnce({ code: 'auth/invalid-action-code' }); fill('DifferentNew123!');
    await waitFor(() => expect(screen.queryByLabelText('New password')).toBeNull());
    expect(screen.getByRole('alert').textContent).toMatch(/already been used/);
  });

  it('rejects missing/malformed links and never calls Firebase with them', () => {
    render(<PasswordResetPage request={{ ...request, code: null }} />);
    expect(screen.getByText(/incomplete or unsupported/)).toBeTruthy(); expect(auth.verify).not.toHaveBeenCalled();
  });

  it('renders Urdu labels/RTL from the email locale and permits changing language', async () => {
    render(<PasswordResetPage request={{ ...request, language: 'ur' }} />);
    expect(await screen.findByLabelText('نیا پاس ورڈ')).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('dir')).toBe('rtl');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(auth.verify).toHaveBeenCalledOnce();
  });

  it('preserves email verification on the compiled Firebase handler without automatically applying an action', () => {
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'manzil-app-v1.firebaseapp.com'); vi.stubEnv('VITE_FIREBASE_API_KEY', 'compiled-public-key');
    render(<PasswordResetPage request={{ mode: 'verifyEmail', code: 'synthetic-verify', language: 'en' }} />);
    const link = new URL(screen.getByRole('link', { name: 'Continue securely' }).getAttribute('href')!);
    expect(link.origin).toBe('https://manzil-app-v1.firebaseapp.com');
    expect(link.searchParams.get('oobCode')).toBe('synthetic-verify');
    expect(link.searchParams.get('apiKey')).toBe('compiled-public-key');
    expect(auth.verify).not.toHaveBeenCalled(); expect(auth.complete).not.toHaveBeenCalled();
  });
});

describe('email action parsing and errors', () => {
  it('only intercepts action requests, uses bounded unambiguous codes and never accepts redirect/key input', () => {
    expect(readEmailAction('?utm_source=home')).toBeNull();
    expect(readEmailAction('', '/account/action')).toMatchObject({ mode: 'unsupported', code: null });
    expect(readEmailAction('?mode=resetPassword&oobCode=abc_123-DEF&lang=ur-PK&apiKey=evil&continueUrl=https://evil.test')).toEqual({ mode: 'resetPassword', code: 'abc_123-DEF', language: 'ur' });
    expect(readEmailAction('?mode=resetPassword&oobCode=first&oobCode=second')?.code).toBeNull();
    expect(readEmailAction('?mode=resetPassword&mode=verifyEmail&oobCode=abc')?.code).toBeNull();
    expect(readEmailAction('?mode=resetPassword&oobCode=abc%3Csvg%3E')?.code).toBeNull();
    expect(readEmailAction(`?mode=resetPassword&oobCode=${'a'.repeat(2049)}`)?.code).toBeNull();
  });

  it('builds non-reset fallback links from validated compile-time host/key only', () => {
    const other: EmailActionRequest = { mode: 'recoverEmail', code: 'abc', language: 'en' };
    expect(hostedEmailActionUrl(other, 'user@evil.test', 'key')).toBeNull();
    expect(hostedEmailActionUrl(other, 'https://evil.test/x', 'key')).toBeNull();
    expect(hostedEmailActionUrl(other, 'localhost', 'key')).toBeNull();
    expect(hostedEmailActionUrl(request, 'manzil.firebaseapp.com', 'key')).toBeNull();
    const url = new URL(hostedEmailActionUrl(other, 'manzil.firebaseapp.com', 'key')!);
    expect(url.pathname).toBe('/__/auth/action'); expect(url.searchParams.has('continueUrl')).toBe(false);
  });

  it('maps only allowlisted errors to app-owned states', () => {
    expect(passwordResetProblem({ code: 'auth/user-not-found' })).toBe('expired');
    expect(passwordResetProblem({ code: 'auth/too-many-requests' })).toBe('network');
    expect(passwordResetProblem({ code: 'auth/invalid-api-key' })).toBe('configuration');
    expect(passwordResetProblem({ code: 'auth/user-disabled' })).toBe('disabled');
    expect(passwordResetProblem({ code: 'private-secret', message: 'private-secret' })).toBe('unknown');
  });
});
