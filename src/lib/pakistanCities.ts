/** GeoNames derivative. Source, exact scope and CC BY 4.0 attribution: docs/PAKISTAN_CITIES.md. */
export interface PakistanCity { name: string; region: string; aliases?: string; search: string }
type CityRow = [name: string, region: string, aliases?: string];
const regions: Record<string, string> = {
  '01': 'Federally Administered Tribal Areas', '02': 'Balochistan', '03': 'Khyber Pakhtunkhwa',
  '04': 'Punjab', '05': 'Sindh', '06': 'Azad Jammu and Kashmir',
  '07': 'Gilgit-Baltistan', '08': 'Islamabad Capital Territory',
};
export const pakistanRegionName = (code: string) => regions[code] ?? 'Pakistan';
export const normalizeCitySearch = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/[’'`-]/g, ' ').replace(/\s+/g, ' ').trim();
let loaded: Promise<readonly PakistanCity[]> | undefined;

/** Load once on opening City, never in the startup map bundle or by calling a geocoding API. */
export function loadPakistanCities(): Promise<readonly PakistanCity[]> {
  loaded ??= import('../catalogues/pakistan-cities.json').then(module => (module.default as CityRow[]).map(([name, region, aliases]) => ({
    name, region, aliases, search: normalizeCitySearch(`${name} ${aliases ?? ''} ${pakistanRegionName(region)}`),
  }))).catch(error => { loaded = undefined; throw error; });
  return loaded;
}

/** The catalogue is population-ranked at build time; a query only renders a capped shortlist. */
export function findPakistanCities(cities: readonly PakistanCity[], query: string, limit = 60): { items: PakistanCity[]; more: boolean } {
  const normalized = normalizeCitySearch(query), tokens = normalized.split(' ').filter(Boolean);
  const prefix: PakistanCity[] = [], other: PakistanCity[] = [];
  let matches = 0;
  for (const city of cities) {
    if (!tokens.every(token => city.search.includes(token))) continue;
    matches++;
    const target = !normalized || city.search.startsWith(normalized) ? prefix : other;
    if (target.length < limit) target.push(city);
  }
  return { items: [...prefix, ...other].slice(0, limit), more: matches > limit };
}
