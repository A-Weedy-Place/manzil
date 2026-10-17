import { describe, expect, it } from 'vitest';
import { findPakistanCities, loadPakistanCities, pakistanRegionName } from '../src/lib/pakistanCities';

describe('real Pakistan profile place catalogue', () => {
  it('covers the major city in each current province/territory with correct region labels', async () => {
    const cities = await loadPakistanCities();
    const examples = [
      ['Karachi', 'Sindh'], ['Lahore', 'Punjab'], ['Peshawar', 'Khyber Pakhtunkhwa'], ['Quetta', 'Balochistan'],
      ['Islamabad', 'Islamabad Capital Territory'], ['Gilgit', 'Gilgit-Baltistan'], ['Muzaffarabad', 'Azad Jammu and Kashmir'],
    ];
    for (const [name, region] of examples) expect(cities.some(city => city.name === name && pakistanRegionName(city.region) === region)).toBe(true);
    expect(new Set(cities.map(city => city.region))).toEqual(new Set(['', '02', '03', '04', '05', '06', '07', '08']));
    expect(cities.every(city => city.name.length > 0 && city.name.length <= 80)).toBe(true);
  });

  it('finds common Urdu major-city names and caps broad searches without truncating the source catalogue', async () => {
    const cities = await loadPakistanCities();
    expect(cities.length).toBeGreaterThan(100_000);
    expect(findPakistanCities(cities, 'کراچی').items.some(city => city.name === 'Karachi')).toBe(true);
    expect(findPakistanCities(cities, 'اسلام آباد').items.some(city => city.name === 'Islamabad' && city.region === '08')).toBe(true);
    const broad = findPakistanCities(cities, ''); expect(broad.items).toHaveLength(60); expect(broad.more).toBe(true); expect(broad.total).toBe(117_579);
    const nextPage = findPakistanCities(cities, '', 60, 60);
    const order = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    expect(broad.items.every((city, index) => index === 0 || order.compare(broad.items[index - 1].name, city.name) <= 0)).toBe(true);
    expect(order.compare(broad.items.at(-1)!.name, nextPage.items[0].name)).toBeLessThanOrEqual(0);
    const finalPage = findPakistanCities(cities, '', 60, 117_540);
    expect(finalPage.items).toHaveLength(39); expect(finalPage.more).toBe(false);
  });
});
