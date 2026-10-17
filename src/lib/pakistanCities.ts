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

const cityOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const orderedCatalogues = new WeakMap<readonly PakistanCity[], PakistanCity[]>();
const lastSearches = new WeakMap<readonly PakistanCity[], { query: string; matches: PakistanCity[] }>();

/** Alphabetic pages share one lazy sort and the latest search, with a bounded rendered page. */
export function findPakistanCities(cities: readonly PakistanCity[], query: string, limit = 60, offset = 0): { items: PakistanCity[]; more: boolean; total: number } {
  let ordered = orderedCatalogues.get(cities);
  if (!ordered) {
    ordered = [...cities].sort((a, b) => cityOrder.compare(a.name, b.name) || cityOrder.compare(pakistanRegionName(a.region), pakistanRegionName(b.region)));
    orderedCatalogues.set(cities, ordered);
  }
  const normalized = normalizeCitySearch(query), tokens = normalized.split(' ').filter(Boolean);
  let search = lastSearches.get(cities);
  if (!search || search.query !== normalized) {
    search = { query: normalized, matches: tokens.length ? ordered.filter(city => tokens.every(token => city.search.includes(token))) : ordered };
    lastSearches.set(cities, search);
  }
  const start = Math.max(0, Math.floor(offset)), size = Math.max(1, Math.floor(limit));
  return { items: search.matches.slice(start, start + size), more: search.matches.length > start + size, total: search.matches.length };
}
