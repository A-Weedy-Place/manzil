// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, LocalProfile } from '../shared/types';
import Modal from '../src/components/Modal';
import ProfilePanel from '../src/components/ProfilePanel';
import ProfileSettingsDialog, { profileSectionTitle, type ProfileSection } from '../src/components/ProfileSettingsDialog';
import { setLanguage } from '../src/lib/language';

const mock = vi.hoisted(() => ({ send: vi.fn(), photo: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: vi.fn(async () => []), send: mock.send }));
vi.mock('../src/lib/auth', () => ({ AUTH_MODE: 'emulator', getAuthSession: () => ({ user: { uid: 'one' } }) }));
vi.mock('../src/lib/images', () => ({ fileToPhotoDataUrl: mock.photo }));
vi.mock('../src/lib/pakistanCities', async original => ({ ...(await original<object>()), loadPakistanCities: async () => [{ name: 'Islamabad', region: '08', search: 'islamabad islamabad capital territory' }] }));

const sections = Object.keys(profileSectionTitle) as ProfileSection[];
const profile: LocalProfile = { id: 'local', displayName: 'Traveller', theme: 'dark', mapStyle: 'night', mapDetail: 'clean', browserNotifications: false, inferFrequentRoutes: false, transport: 'car', createdAt: '', updatedAt: '' };
const state = (patch: Partial<LocalProfile> = {}) => ({ profile: { ...profile, ...patch }, trips: [], commutes: [], alerts: [], closures: [], notices: [], eventRevision: 0 } as unknown as AppState);
const props = { reload: vi.fn(async () => {}), notify: vi.fn(), onSources: vi.fn(), onActivity: vi.fn(), onSaveProposal: vi.fn(async () => {}) };

function SettingsFixture({ section, bubbled = vi.fn() }: { section: ProfileSection; bubbled?: () => void }) {
  const [open, setOpen] = useState(false);
  return <div onClick={bubbled}><button onClick={() => setOpen(true)}>Open settings</button>{open && <ProfileSettingsDialog section={section} onClose={() => setOpen(false)}>
    <label>Setting value<input defaultValue="Saved value" /></label><button>Internal action</button>
    <label>Setting choice<select defaultValue="one"><option value="one">One</option><option value="two">Two</option></select></label>
  </ProfileSettingsDialog>}</div>;
}
function ControlledProfile({ patch = {} }: { patch?: Partial<LocalProfile> }) {
  const [section, setSection] = useState<ProfileSection | null>(null);
  return <><ProfilePanel {...props} state={state(patch)} personalFeaturesAvailable section={section} onSectionChange={setSection} />
    {(section === 'statistics' || section === 'history') && <ProfileSettingsDialog section={section} onClose={() => setSection(null)}><p>Private information</p></ProfileSettingsDialog>}
  </>;
}
function backdrop() { return screen.getByRole('dialog').parentElement!; }

beforeEach(() => { setLanguage('en'); mock.send.mockReset().mockResolvedValue({}); mock.photo.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('en'); });

describe('profile secondary-panel dismissal', () => {
  it.each(sections)('dismisses %s on an outside click, consumes it and returns focus without closing on internal controls', async section => {
    const user = userEvent.setup(), bubbled = vi.fn(); render(<SettingsFixture section={section} bubbled={bubbled} />);
    const trigger = screen.getByRole('button', { name: 'Open settings' }); await user.click(trigger); bubbled.mockClear();
    const dialog = screen.getByRole('dialog', { name: profileSectionTitle[section] });
    await user.click(within(dialog).getByLabelText('Setting value'));
    await user.type(within(dialog).getByLabelText('Setting value'), ' edit');
    await user.click(within(dialog).getByRole('button', { name: 'Internal action' }));
    await user.selectOptions(within(dialog).getByLabelText('Setting choice'), 'two');
    expect(screen.getByRole('dialog')).toBe(dialog);
    bubbled.mockClear(); await user.click(backdrop());
    expect(screen.queryByRole('dialog')).toBeNull(); expect(bubbled).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
  });

  it('does not dismiss when a drag starts inside and ends outside, or starts outside and ends inside', () => {
    const close = vi.fn(); render(<ProfileSettingsDialog section="identity" onClose={close}><input aria-label="Name" /></ProfileSettingsDialog>);
    const input = screen.getByLabelText('Name'), outside = backdrop();
    fireEvent.pointerDown(input, { button: 0, pointerId: 1 }); fireEvent.pointerUp(outside, { button: 0, pointerId: 1 }); fireEvent.click(outside, { button: 0 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(outside, { button: 0, pointerId: 2 }); fireEvent.pointerUp(input, { button: 0, pointerId: 2 }); fireEvent.click(outside, { button: 0 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(outside, { button: 0, pointerId: 3 }); fireEvent.pointerCancel(outside, { pointerId: 3 }); fireEvent.click(outside, { button: 0 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(outside, { button: 2, pointerId: 4 }); fireEvent.pointerUp(outside, { button: 2, pointerId: 4 }); fireEvent.click(outside, { button: 2 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(outside, { button: 0, pointerId: 5 }); fireEvent.pointerUp(outside, { button: 0, pointerId: 5 }); fireEvent.click(outside, { button: 0 });
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps outside dismissal opt-in for other modal workflows', async () => {
    const close = vi.fn(), user = userEvent.setup(); render(<Modal titleId="required-choice" onClose={close}><h1 id="required-choice">Required choice</h1><button>Continue</button></Modal>);
    await user.click(backdrop()); expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  });

  it('lets keyboard users reach daily-value summaries and textareas before wrapping the shared dialog focus', async () => {
    // JSDOM has no layout; expose the fixture controls as visible to the trap.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList);
    const user = userEvent.setup(); render(<ProfileSettingsDialog section="statistics" onClose={vi.fn()}>
      <button>About daily charts</button>
      <details><summary>View daily distance values</summary><p>17 Oct · 12 km</p></details>
      <label>Trip note<textarea /></label>
      <details><summary>View daily fuel values</summary><p>17 Oct · 1 litre</p></details>
    </ProfileSettingsDialog>);
    const close = screen.getByRole('button', { name: 'Close settings' }), distanceValues = screen.getByText('View daily distance values'), fuelValues = screen.getByText('View daily fuel values');
    await user.click(screen.getByRole('button', { name: 'About daily charts' }));
    await user.tab(); expect(document.activeElement).toBe(distanceValues);
    await user.tab(); expect(document.activeElement).toBe(screen.getByLabelText('Trip note'));
    await user.tab(); expect(document.activeElement).toBe(fuelValues);
    await user.tab(); expect(document.activeElement).toBe(close);
    await user.tab({ shift: true }); expect(document.activeElement).toBe(fuelValues);
    await user.tab({ shift: true }); expect(document.activeElement).toBe(screen.getByLabelText('Trip note'));
  });

  it.each(sections)('toggles the active %s row closed and leaves the next opening clean', section => {
    render(<ControlledProfile />); const row = screen.getByRole('button', { name: section === 'identity' ? 'Edit' : profileSectionTitle[section] });
    fireEvent.click(row); expect(screen.getByRole('dialog', { name: profileSectionTitle[section] })).toBeTruthy(); expect(row.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(row); expect(screen.queryByRole('dialog')).toBeNull(); expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row); expect(screen.getByRole('dialog', { name: profileSectionTitle[section] })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' })); expect(screen.queryByRole('dialog')).toBeNull();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('treats city results as internal, preserves the first-Escape combobox behavior and discards edits on outside dismissal', async () => {
    const user = userEvent.setup(); render(<ControlledProfile />); await user.click(screen.getByRole('button', { name: 'Edit' }));
    const city = screen.getByRole('combobox', { name: 'City' }); await user.click(city);
    await user.click(await screen.findByRole('option', { name: 'Islamabad, Islamabad Capital Territory' }));
    expect(city).toHaveProperty('value', 'Islamabad'); expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(city); await screen.findByRole('option'); await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull(); expect(screen.getByRole('dialog')).toBeTruthy();
    await user.type(screen.getByLabelText('Your name'), ' unsaved'); await user.click(backdrop());
    expect(mock.send).not.toHaveBeenCalled(); await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Your name')).toHaveProperty('value', 'Traveller'); expect(screen.getByRole('combobox', { name: 'City' })).toHaveProperty('value', '');
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('discards a photo preparation after outside dismissal without saving or repopulating the next edit', async () => {
    let complete!: (photo: string) => void; mock.photo.mockReturnValue(new Promise<string>(resolve => { complete = resolve; }));
    render(<ControlledProfile />); fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [new File(['test'], 'profile.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByRole('button', { name: 'Save profile' }).matches(':disabled')).toBe(true);
    fireEvent.click(backdrop()); fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await act(async () => complete('data:image/jpeg;base64,cHJpdmF0ZQ=='));
    expect(screen.queryByAltText('Your profile photo')).toBeNull(); expect(mock.send).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save profile' }).matches(':disabled')).toBe(false);
  });

  it.each([undefined, 'system', 'light', 'dark'] as const)('shows the correct appearance summary and selection for saved theme %s', theme => {
    render(<ControlledProfile patch={{ theme }} />);
    const row = screen.getByRole('button', { name: 'Appearance & language' }), label = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';
    expect(row.textContent).toContain(`${label} · Night`); fireEvent.click(row);
    expect(within(screen.getByRole('group', { name: 'App theme' })).getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
    expect(mock.send).not.toHaveBeenCalled();
  });
});
