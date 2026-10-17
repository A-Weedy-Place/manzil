import { describe, expect, it } from 'vitest';
import { findPakistanCities, loadPakistanCities, pakistanRegionName } from '../src/lib/pakistanCities';

describe('curated Pakistan profile city catalogue', () => {
  it('covers the major city in each current province/territory with correct region labels', async () => {
    const cities = await loadPakistanCities();
    const examples = [
      ['Karachi', 'Sindh'], ['Lahore', 'Punjab'], ['Peshawar', 'Khyber Pakhtunkhwa'], ['Quetta', 'Balochistan'],
      ['Islamabad', 'Islamabad Capital Territory'], ['Gilgit', 'Gilgit-Baltistan'], ['Muzaffarabad', 'Azad Jammu and Kashmir'],
    ];
    for (const [name, region] of examples) expect(cities.some(city => city.name === name && pakistanRegionName(city.region) === region)).toBe(true);
    expect(new Set(cities.map(city => city.region))).toEqual(new Set(['02', '03', '04', '05', '06', '07', '08']));
    expect(cities.every(city => city.name.length > 0 && city.name.length <= 80)).toBe(true);
  });

  it('offers 96 alphabetic major cities, available Urdu aliases and familiar alternate spellings', async () => {
    const cities = await loadPakistanCities();
    expect(cities).toHaveLength(96);
    expect(findPakistanCities(cities, 'کراچی').items.some(city => city.name === 'Karachi')).toBe(true);
    expect(findPakistanCities(cities, 'اسلام آباد').items.some(city => city.name === 'Islamabad' && city.region === '08')).toBe(true);
    const broad = findPakistanCities(cities, ''); expect(broad.items).toHaveLength(96); expect(broad.total).toBe(96);
    const order = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    expect(broad.items.every((city, index) => index === 0 || order.compare(broad.items[index - 1].name, city.name) <= 0)).toBe(true);
    expect(broad.items[0].name).toBe('Abbottabad'); expect(broad.items.at(-1)!.name).toBe('Zhob');
    expect(new Set(cities.map(city => `${city.name}:${city.region}`)).size).toBe(96);
    expect(findPakistanCities(cities, 'Shekhupura').items[0].name).toBe('Sheikhupura');
    expect(findPakistanCities(cities, 'New Mirpur City').items[0].name).toBe('Mirpur');
    expect(findPakistanCities(cities, 'Hunza').items[0].name).toBe('Karimabad');
  });
});
