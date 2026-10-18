// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountPanel from '../src/components/AccountPanel';
import { setLanguage } from '../src/lib/language';

const auth = vi.hoisted(() => ({ create: vi.fn(), signIn: vi.fn(), reset: vi.fn() }));
vi.mock('../src/lib/auth', () => ({
  DEV_ACCOUNTS: [], DEV_AUTH_ENABLED: false, EMULATOR_AUTH_ENABLED: false, FIREBASE_AUTH_ENABLED: true,
  createAccount: auth.create, signInAccount: auth.signIn, resetPassword: auth.reset,
}));

beforeEach(() => { vi.resetAllMocks(); setLanguage('en'); auth.create.mockResolvedValue('created-user'); });
afterEach(() => { cleanup(); setLanguage('en'); });

describe('simplified account entry', () => {
  it('shows and hides the entered password without submitting or changing it', () => {
    render(<AccountPanel entry onClose={vi.fn()} />);
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'SyntheticVisibility123!' } });
    const reveal = screen.getByRole('button', { name: 'Show password' });
    expect(password.type).toBe('password'); expect(reveal.getAttribute('aria-pressed')).toBe('false');
    expect(reveal.getAttribute('aria-controls')).toBe(password.id);
    fireEvent.click(reveal);
    expect(password.type).toBe('text'); expect(password.value).toBe('SyntheticVisibility123!');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
    expect(auth.signIn).not.toHaveBeenCalled(); expect(auth.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.type).toBe('password'); expect(password.value).toBe('SyntheticVisibility123!');
  });

  it('starts registration hidden and clears password visibility on every account screen change', () => {
    render(<AccountPanel entry onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SyntheticVisibility123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Password')).toHaveProperty('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProperty('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByLabelText('Password')).toHaveProperty('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide password' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close sign in' })).toBeNull();
  });

  it('translates password controls and exposes an explicit close action only in the in-app account dialog', () => {
    setLanguage('ur'); const close = vi.fn(); render(<AccountPanel onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'پاس ورڈ دکھائیں' }));
    expect(screen.getByLabelText('پاس ورڈ')).toHaveProperty('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'پاس ورڈ چھپائیں' }));
    expect(screen.getByLabelText('پاس ورڈ')).toHaveProperty('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'سائن ان بند کریں' }));
    expect(close).toHaveBeenCalledOnce(); expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('lets people pause the decorative entry scene without changing the form or entering the app', () => {
    const close = vi.fn(); render(<AccountPanel entry onClose={close} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@manzil.test' } });
    const scenery = document.querySelector('.entry-doodles');
    expect(scenery?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause background animation' }));
    expect(scenery?.getAttribute('data-paused')).toBe('true');
    expect(screen.getByRole('button', { name: 'Play background animation' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('person@manzil.test');
    expect(close).not.toHaveBeenCalled(); expect(auth.signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play background animation' }));
    expect(scenery?.getAttribute('data-paused')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(document.querySelector('.entry-doodles')).toBe(scenery);
    expect(screen.getByRole('dialog', { name: 'Create account' })).toBeTruthy();
  });

  it('pauses decorative animation when the page is hidden and removes its visibility listener on exit', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<AccountPanel entry onClose={vi.fn()} />);
    const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(document.querySelector('.entry-doodles')?.getAttribute('data-paused')).toBe('true');
    visibility.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(document.querySelector('.entry-doodles')?.getAttribute('data-paused')).toBe('false');
    unmount();
    expect(remove.mock.calls.some(([event]) => event === 'visibilitychange')).toBe(true);
    visibility.mockRestore(); remove.mockRestore();
  });

  it('shows the English brand, an optional guest action and decorative map without environment clutter', () => {
    const close = vi.fn(); render(<AccountPanel entry onClose={close} />);
    expect(screen.getByRole('dialog', { name: 'Manzil' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Manzil' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Route preview' }).querySelector('img')?.getAttribute('alt')).toBe('');
    expect(screen.queryByText(/Firebase|emulators|Your journeys, together/)).toBeNull();
    expect(screen.queryByText('MANZIL · منزل')).toBeNull();
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getAllByRole('button', { name: 'Continue as guest' })).toHaveLength(1);
    const signIn = screen.getByRole('button', { name: 'Sign in' });
    expect(signIn.querySelector('.lucide-log-in')).toBeTruthy();
    expect(signIn.querySelector('.lucide-mail')).toBeNull();
    expect(document.querySelector('.account-modal .modal-close')).toBeNull();
    fireEvent.click(screen.getByText('Continue as guest', { selector: 'button' }));
    expect(close).toHaveBeenCalledOnce(); expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('keeps registration optional, creates the account and supplies its UID before entering the app', async () => {
    const order: string[] = [], onCreated = vi.fn((uid: string) => order.push(uid)), onAuthenticated = vi.fn(() => order.push('entered'));
    const close = vi.fn(); render(<AccountPanel entry onClose={close} onAuthenticated={onAuthenticated} onAccountCreated={onCreated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('dialog', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByText('Continue as guest', { selector: 'button' })).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@manzil.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'NewPassword123!' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('created-user'));
    expect(auth.create).toHaveBeenCalledWith('new@manzil.test', 'NewPassword123!');
    expect(order).toEqual(['created-user', 'entered']); expect(close).not.toHaveBeenCalled();
  });

  it('still creates an account when the optional registration callback is omitted', async () => {
    const close = vi.fn(); render(<AccountPanel onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@manzil.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'NewPassword123!' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }));
    await waitFor(() => expect(auth.create).toHaveBeenCalledOnce());
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it('retains reset feedback, clears it when changing screens and keeps the in-app dialog compact', async () => {
    const close = vi.fn(); render(<AccountPanel onClose={close} />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.querySelector('.entry-doodles')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause background animation' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@manzil.test' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Check your email'));
    expect(auth.reset).toHaveBeenCalledWith('person@manzil.test'); expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Manzil' })).toBeTruthy();
  });

  it('does not enter the app or signal consent setup when account creation fails', async () => {
    auth.create.mockRejectedValueOnce(new Error('Network error'));
    const close = vi.fn(), created = vi.fn(); render(<AccountPanel onClose={close} onAccountCreated={created} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(created).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email').matches(':disabled')).toBe(false);
  });

  it('retains the reset form for retry after a failed request and clears the error on success', async () => {
    auth.reset.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(undefined);
    const close = vi.fn(); render(<AccountPanel onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@manzil.test' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'person@manzil.test');
    expect(screen.getByRole('button', { name: 'Reset password' }).matches(':disabled')).toBe(false);
    fireEvent.submit(screen.getByRole('form', { name: 'Reset password' }));
    await screen.findByRole('status');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(auth.reset).toHaveBeenCalledTimes(2); expect(close).not.toHaveBeenCalled();
  });
});
