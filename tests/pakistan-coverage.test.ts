import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../shared/types';
import { isInPakistan } from '../server/routing/pakistan';

describe('Pakistan-only planning coverage', () => {
  it.each<[string, Coordinate]>([
    ['Islamabad', [73.0479, 33.6844]], ['Rawalpindi', [73.0169, 33.5651]],
    ['Lahore', [74.3587, 31.5204]], ['Karachi', [67.0011, 24.8607]],
    ['Peshawar', [71.5249, 34.0151]], ['Quetta', [66.975, 30.1798]],
    ['Gwadar', [62.3257, 25.1264]], ['Gilgit', [74.308, 35.9208]],
    ['Skardu', [75.6333, 35.3]], ['Muzaffarabad', [73.4711, 34.3704]],
  ])('accepts %s outside the old city boundary', (_name, point) => expect(isInPakistan(point)).toBe(true));
  it.each<Coordinate>([[77.209, 28.6139], [69.2075, 34.5553], [55.2708, 25.2048], [-0.1276, 51.5072], [NaN, 30], [73, 91]])('rejects coordinates outside Pakistan: %j', (longitude, latitude) => {
    expect(isInPakistan([longitude, latitude])).toBe(false);
  });
});
