// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('does not save a search string, cancels on Tab and preserves unmatched legacy cities', async () => {
    const saved = vi.fn(); render(<Editor saved={saved} />);
    const city = screen.getByRole('combobox', { name: 'City' });
    fireEvent.focus(city); await screen.findByRole('listbox');
    fireEvent.change(city, { target: { value: 'Not a selected city' } });
    await screen.findByText('No cities found');
    fireEvent.keyDown(city, { key: 'Enter' }); expect(saved).not.toHaveBeenCalled();
    fireEvent.keyDown(city, { key: 'Tab' });
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

  it('does not load the catalogue for a disabled control, and caps rendered results', async () => {
    const view = render(<Editor disabled />);
    expect(screen.getByRole('combobox').matches(':disabled')).toBe(true); expect(mock.load).not.toHaveBeenCalled();
    view.unmount(); mock.load.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({ name: `Town ${index}`, region: '04', search: `town ${index} punjab` })));
    render(<Editor initial="" />); fireEvent.focus(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(60));
    expect(screen.getByText('More matches. Keep typing to narrow the list.')).toBeTruthy();
  });

  it('matches accents, Urdu, multiword queries and province qualifiers while prioritising name prefixes', () => {
    expect(normalizeCitySearch('  Rāwal-Pindi ’ ')).toBe('rawal pindi');
    expect(findPakistanCities(examples, 'lahore punjab').items[0].name).toBe('Lahore');
    expect(findPakistanCities(examples, 'اسلام آباد').items[0].name).toBe('Islamabad');
    const places = [{ name: 'New Lahore', region: '04', search: 'new lahore punjab' }, ...examples];
    expect(findPakistanCities(places, 'lahore').items.map(city => city.name)).toEqual(['Lahore', 'New Lahore']);
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
