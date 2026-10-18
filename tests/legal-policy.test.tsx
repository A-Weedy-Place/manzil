// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState, LocalProfile } from '../shared/types';
import ProfilePanel from '../src/components/ProfilePanel';
import { api, send } from '../src/lib/api';
import { setLanguage } from '../src/lib/language';

vi.mock('../src/lib/api', () => ({ api: vi.fn(async () => []), send: vi.fn() }));
vi.mock('../src/lib/auth', () => ({ AUTH_MODE: 'emulator', getAuthSession: () => ({ user: null }) }));
const profile: LocalProfile = { id: 'local', displayName: 'Traveller', theme: 'dark', mapStyle: 'outdoors', mapDetail: 'clean', browserNotifications: false, collectTravelData: false, inferFrequentRoutes: false, transport: 'car', createdAt: '', updatedAt: '' };
const state = { profile, trips: [], commutes: [], alerts: [], closures: [], notices: [], eventRevision: 0 } as unknown as AppState;
const props = { state, reload: vi.fn(async () => {}), notify: vi.fn(), onSources: vi.fn(), onActivity: vi.fn(), onSignIn: vi.fn(), onSaveProposal: vi.fn(async () => {}) };
let location: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setLanguage('en'); vi.mocked(api).mockClear(); vi.mocked(send).mockClear(); props.onSignIn.mockClear();
  location = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: location, watchPosition: location } });
});
afterEach(() => { cleanup(); setLanguage('en'); vi.restoreAllMocks(); });

it('lets a guest read both policies in the shared settings panel without signing in, fetching data or changing consent', () => {
  render(<ProfilePanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Terms & Conditions' }));
  let dialog = screen.getByRole('dialog', { name: 'Terms & Conditions' });
  expect(within(dialog).getByRole('heading', { name: '2. Travel safely' })).toBeTruthy();
  expect(dialog.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-18');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Privacy Policy' }));
  dialog = screen.getByRole('dialog', { name: 'Privacy Policy' });
  expect(within(dialog).getByRole('heading', { name: '6. Retention and deletion' })).toBeTruthy();
  expect(within(dialog).getByText(/raw GPS points after 30 days.*summaries after 90 days/)).toBeTruthy();
  expect(within(dialog).getByText(/does not offer a self-service account-deletion button/)).toBeTruthy();
  expect(within(dialog).getByText(/does not send your live position for that forecast/)).toBeTruthy();
  expect(within(dialog).queryByRole('checkbox')).toBeNull(); expect(within(dialog).queryByRole('button', { name: /accept|agree|allow/i })).toBeNull();
  expect(props.onSignIn).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(location).not.toHaveBeenCalled(); expect(profile.collectTravelData).toBe(false);
});

it.each(['outside', 'escape', 'close', 'repeat'] as const)('dismisses the policy on %s, keeps content clicks inside, and restores focus', async method => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList);
  const user = userEvent.setup(); render(<ProfilePanel {...props} />);
  const trigger = screen.getByRole('button', { name: 'Privacy Policy' }); await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Privacy Policy' });
  await user.click(within(dialog).getByRole('heading', { name: '2. Location and optional history' })); expect(screen.getByRole('dialog')).toBe(dialog);
  if (method === 'outside') await user.click(dialog.parentElement!);
  else if (method === 'escape') await user.keyboard('{Escape}');
  else if (method === 'close') await user.click(within(dialog).getByRole('button', { name: 'Close settings' }));
  else fireEvent.click(trigger);
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
});

it('keeps policy switching and external links keyboard-accessible with secure public destinations', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList);
  const user = userEvent.setup(); render(<ProfilePanel {...props} />); await user.click(screen.getByRole('button', { name: 'Privacy Policy' }));
  const dialog = screen.getByRole('dialog'), links = within(dialog).getAllByRole('link');
  expect(links.length).toBeGreaterThan(4);
  for (const link of links) { expect(link.getAttribute('href')).toMatch(/^https:\/\//); expect(link.getAttribute('target')).toBe('_blank'); expect(link.getAttribute('rel')).toContain('noreferrer'); }
  links.at(-1)!.focus(); await user.tab(); expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close settings' }));
  within(dialog).getByRole('button', { name: 'Terms & Conditions' }).focus(); await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog', { name: 'Terms & Conditions' })).toBeTruthy(); expect(send).not.toHaveBeenCalled();
});

it('renders complete Urdu policy text and semantic RTL content when the language changes', () => {
  render(<ProfilePanel {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Privacy Policy' }));
  act(() => setLanguage('ur'));
  const dialog = screen.getByRole('dialog', { name: 'رازداری کی پالیسی' });
  expect(within(dialog).getByRole('heading', { name: '۶۔ مدت اور حذف کرنا' })).toBeTruthy();
  expect(within(dialog).getByRole('article').getAttribute('dir')).toBe('rtl'); expect(within(dialog).getByRole('article').getAttribute('lang')).toBe('ur');
  expect(within(dialog).getByText('۱۸ اکتوبر ۲۰۲۶')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'شرائط و ضوابط' }));
  expect(within(screen.getByRole('dialog', { name: 'شرائط و ضوابط' })).getByRole('heading', { name: '۲۔ محفوظ سفر' })).toBeTruthy();
  expect(send).not.toHaveBeenCalled(); expect(location).not.toHaveBeenCalled();
});
