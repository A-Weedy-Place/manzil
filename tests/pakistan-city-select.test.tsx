// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PakistanCitySelect from '../src/components/PakistanCitySelect';
import ProfileSettingsDialog from '../src/components/ProfileSettingsDialog';
import { findPakistanCities, normalizeCitySearch, type PakistanCity } from '../src/lib/pakistanCities';

const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/lib/pakistanCities', async original => ({ ...(await original<object>()), loadPakistanCities: mock.load }));
const examples: PakistanCity[] = [
  { name: 'Karachi', region: '05', search: 'karachi کراچی sindh' },
  { name: 'Lahore', region: '04', search: 'lahore لاہور punjab' },
  { name: 'Islamabad', region: '08', search: 'islamabad اسلام آباد islamabad capital territory' },
].map(city => ({ ...city, search: normalizeCitySearch(city.search) }));
function Editor({ initial = 'Old city spelling', disabled = false, saved = vi.fn() }: { initial?: string; disabled?: boolean; saved?: (city: string) => void }) {
  const [city, setCity] = useState(initial);
  return <form onSubmit={event => { event.preventDefault(); saved(city); }}><PakistanCitySelect value={city} onChange={setCity} disabled={disabled} /><button type="submit">Save</button></form>;
}
beforeEach(() => { mock.load.mockReset().mockResolvedValue(examples); });
afterEach(cleanup);

describe('Pakistan city picker', () => {
  it('keeps the current coarse city until a result is selected, with keyboard navigation and lazy loading', async () => {
    const saved = vi.fn(); render(<Editor saved={saved} />);
    const city = screen.getByRole('combobox', { name: 'City' });
    expect(city).toHaveProperty('value', 'Old city spelling'); expect(mock.load).not.toHaveBeenCalled();
    fireEvent.focus(city); await screen.findByRole('option', { name: /Karachi/ });
    expect(screen.getByText('Old city spelling')).toBeTruthy();
    fireEvent.change(city, { target: { value: 'لاہور' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(city.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(city, { key: 'ArrowDown' });
    expect(city.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option').id);
    fireEvent.keyDown(city, { key: 'Enter' });
    expect(city).toHaveProperty('value', 'Lahore'); expect(screen.queryByRole('listbox')).toBeNull();
    expect(saved).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
    expect(saved).toHaveBeenCalledWith('Lahore');
  });

  it('does not save a search string, cancels when Tab leaves the picker and preserves unmatched legacy cities', async () => {
    const saved = vi.fn(); render(<Editor saved={saved} />);
    const city = screen.getByRole('combobox', { name: 'City' });
    await userEvent.click(city); await screen.findByRole('listbox');
    fireEvent.change(city, { target: { value: 'Not a selected city' } });
    await screen.findByText('No cities found');
    fireEvent.keyDown(city, { key: 'Enter' }); expect(saved).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(screen.getByRole('listbox')).toBeTruthy();
    await userEvent.tab();
    expect(screen.getByRole('listbox')).toBeTruthy();
    await userEvent.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(city).toHaveProperty('value', 'Old city spelling');
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
    expect(saved).toHaveBeenCalledWith('Old city spelling');
  });

  it('consumes the first Escape inside an open modal and leaves the next Escape to close the settings panel', async () => {
    const close = vi.fn(); render(<ProfileSettingsDialog section="identity" onClose={close}><Editor /></ProfileSettingsDialog>);
    const city = screen.getByRole('combobox', { name: 'City' }); fireEvent.focus(city);
    await screen.findByRole('option', { name: /Karachi/ });
    fireEvent.keyDown(city, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull(); expect(close).not.toHaveBeenCalled();
    expect(city).toHaveProperty('value', 'Old city spelling');
    fireEvent.keyDown(city, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the result list in the scrollable form, selects by pointer and permits an explicit empty city', async () => {
    render(<Editor />); const city = screen.getByRole('combobox', { name: 'City' }); fireEvent.focus(city);
    await screen.findByRole('option', { name: /Lahore/ });
    expect(screen.getByRole('listbox').closest('form')).toBe(city.closest('form'));
    fireEvent.click(screen.getByRole('option', { name: /Lahore/ })); expect(city).toHaveProperty('value', 'Lahore');
    fireEvent.click(screen.getByRole('button', { name: 'Clear city' }));
    fireEvent.keyDown(city, { key: 'Escape' }); expect(city).toHaveProperty('value', '');
  });

  it('reports loading failure without erasing the existing city and retries on reopening', async () => {
    mock.load.mockRejectedValueOnce(new Error('Chunk unavailable'));
    render(<Editor />); const city = screen.getByRole('combobox', { name: 'City' }); fireEvent.focus(city);
    await screen.findByText('Could not load cities. Close and try again.');
    fireEvent.keyDown(city, { key: 'Escape' }); expect(city).toHaveProperty('value', 'Old city spelling');
    fireEvent.click(screen.getByRole('button', { name: 'Cities in Pakistan' }));
    await screen.findByRole('option', { name: /Karachi/ }); expect(mock.load).toHaveBeenCalledTimes(2);
  });

  it('does not load a disabled control and shows the complete small list alphabetically without paging', async () => {
    const view = render(<Editor disabled />);
    expect(screen.getByRole('combobox').matches(':disabled')).toBe(true); expect(mock.load).not.toHaveBeenCalled();
    view.unmount(); mock.load.mockResolvedValue(Array.from({ length: 96 }, (_, index) => ({ name: `Town ${95 - index}`, region: '04', search: `town ${95 - index} punjab` })));
    render(<Editor initial="" />); fireEvent.focus(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(96));
    expect(screen.getByText('96')).toBeTruthy();
    expect(screen.getAllByRole('option')[0].getAttribute('aria-label')).toBe('Town 0, Punjab');
    expect(screen.getAllByRole('option').at(-1)!.getAttribute('aria-label')).toBe('Town 95, Punjab');
    expect(screen.getAllByRole('option').at(-1)!.getAttribute('aria-posinset')).toBe('96');
    expect(screen.getAllByRole('option')[0].getAttribute('aria-setsize')).toBe('96');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Town 12' } });
    expect(screen.getAllByRole('option').map(option => option.getAttribute('aria-label'))).toEqual(['Town 12, Punjab']);
    expect(screen.queryByRole('button', { name: 'Previous cities' })).toBeNull();
  });

  it('matches accents, Urdu, multiword queries and province qualifiers in alphabetic order', () => {
    expect(normalizeCitySearch('  Rāwal-Pindi ’ ')).toBe('rawal pindi');
    expect(findPakistanCities(examples, 'lahore punjab').items[0].name).toBe('Lahore');
    expect(findPakistanCities(examples, 'اسلام آباد').items[0].name).toBe('Islamabad');
    const places = [{ name: 'New Lahore', region: '04', search: 'new lahore punjab' }, ...examples];
    expect(findPakistanCities(places, 'lahore').items.map(city => city.name)).toEqual(['Lahore', 'New Lahore']);
    const withPrefix = [{ name: 'A New Lahore', region: '04', search: 'a new lahore punjab' }, ...places];
    expect(findPakistanCities(withPrefix, 'lahore').items.map(city => city.name)).toEqual(['A New Lahore', 'Lahore', 'New Lahore']);
  });

  it('lets keyboard users move through the alphabetic list without submitting', async () => {
    mock.load.mockResolvedValue(Array.from({ length: 96 }, (_, index) => ({ name: `Town ${index}`, region: '04', search: `town ${index} punjab` })));
    const saved = vi.fn(); render(<Editor initial="Legacy city" saved={saved} />);
    const city = screen.getByRole('combobox'); fireEvent.focus(city);
    await screen.findByRole('option', { name: 'Town 0, Punjab' });
    fireEvent.keyDown(city, { key: 'End' }); fireEvent.keyDown(city, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Town 95, Punjab' }).id).toBe(city.getAttribute('aria-activedescendant'));
    fireEvent.keyDown(city, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: 'Town 94, Punjab' }).id).toBe(city.getAttribute('aria-activedescendant'));
    fireEvent.keyDown(city, { key: 'Home' }); fireEvent.keyDown(city, { key: 'PageDown' });
    expect(screen.getByRole('option', { name: 'Town 5, Punjab' }).id).toBe(city.getAttribute('aria-activedescendant'));
    fireEvent.keyDown(city, { key: 'PageUp' });
    expect(screen.getByRole('option', { name: 'Town 0, Punjab' }).id).toBe(city.getAttribute('aria-activedescendant'));
    fireEvent.keyDown(city, { key: 'Escape' });
    expect(saved).not.toHaveBeenCalled(); expect(city).toHaveProperty('value', 'Legacy city');
    fireEvent.click(city);
    expect(screen.getByRole('option', { name: 'Town 0, Punjab' })).toBeTruthy();
  });

  it('keeps the source link keyboard reachable without selecting or changing the legacy city', async () => {
    const saved = vi.fn(); render(<Editor initial="Legacy city" saved={saved} />);
    const city = screen.getByRole('combobox'); await userEvent.click(city);
    await screen.findByRole('link', { name: 'GeoNames · CC BY 4.0' });
    await userEvent.tab(); await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'GeoNames · CC BY 4.0' }));
    expect(saved).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull(); expect(city).toHaveProperty('value', 'Legacy city'); expect(document.activeElement).toBe(city);
  });

  it.each(['Cities in Pakistan', 'GeoNames · CC BY 4.0'])('closes only the city list on first Escape from %s inside settings', async name => {
    const close = vi.fn(); render(<ProfileSettingsDialog section="identity" onClose={close}><Editor /></ProfileSettingsDialog>);
    const city = screen.getByRole('combobox'); await userEvent.click(city);
    await screen.findByRole('link', { name: 'GeoNames · CC BY 4.0' });
    const control = name === 'Cities in Pakistan' ? screen.getByRole('button', { name }) : screen.getByRole('link', { name });
    control.focus(); await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull(); expect(close).not.toHaveBeenCalled(); expect(document.activeElement).toBe(city);
    await userEvent.keyboard('{Escape}'); expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the city input transparent and borderless against the global field rules', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve('src/components/PakistanCitySelect.css'), 'utf8') + readFileSync(resolve('src/redesign.css'), 'utf8');
    document.head.append(style);
    try {
      render(<Editor />); const city = screen.getByRole('combobox');
      expect(getComputedStyle(city).borderTopWidth).toBe('0px');
      expect(getComputedStyle(city).borderRadius).toBe('0px');
      expect(getComputedStyle(city).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      fireEvent.focus(city);
      expect(getComputedStyle(city).boxShadow).toBe('none');
    } finally { style.remove(); }
  });

  it('selects only one regional result for a legacy name and remembers an explicit regional choice in the draft', async () => {
    mock.load.mockResolvedValue([
      { name: 'Islamabad', region: '08', search: 'islamabad islamabad capital territory' },
      { name: 'Islamabad', region: '04', search: 'islamabad punjab' },
      { name: 'Islamabad', region: '05', search: 'islamabad sindh' },
    ]);
    const saved = vi.fn(); render(<Editor initial="Islamabad" saved={saved} />);
    const city = screen.getByRole('combobox', { name: 'City' }); fireEvent.focus(city);
    await screen.findByRole('option', { name: 'Islamabad, Punjab' });
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('option', { selected: true }).getAttribute('aria-label')).toBe('Islamabad, Islamabad Capital Territory');
    fireEvent.click(screen.getByRole('option', { name: 'Islamabad, Punjab' }));
    fireEvent.click(city);
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('option', { selected: true }).getAttribute('aria-label')).toBe('Islamabad, Punjab');
    expect(saved).not.toHaveBeenCalled();
    fireEvent.keyDown(city, { key: 'Escape' });
    expect(city).toHaveProperty('value', 'Islamabad');
  });
});
