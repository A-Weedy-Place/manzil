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
    const broad = findPakistanCities(cities, ''); expect(broad.items).toHaveLength(60); expect(broad.more).toBe(true);
  });
});
