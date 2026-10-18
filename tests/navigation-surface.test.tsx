// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NavigationPanel from '../src/components/NavigationPanel';
import { setLanguage } from '../src/lib/language';
import type { RouteOption } from '../shared/types';

vi.mock('../src/lib/speech', () => ({ NavigationSpeaker: class {
  cancel() {}
  prepare() {}
  speak = vi.fn(async () => {});
} }));

const route: RouteOption = {
  id: 'clear', kind: 'direct', label: 'Recommended', validation: 'clear', warnings: [],
  geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.71]] },
  distanceMeters: 1112, durationSeconds: 120,
  departureAt: '2026-10-18T10:00:00Z', arrivalAt: '2026-10-18T10:02:00Z',
  steps: [{ instruction: 'Continue', roadName: 'Test Road', distanceMeters: 1112, durationSeconds: 120 }],
  snappedOrigin: [73, 33.7], snappedDestination: [73, 33.71],
};
const props = () => ({ route, destination: 'F-8', stale: false, onBack: vi.fn(), onPosition: vi.fn(), onReplan: vi.fn(async () => route), onFocus: vi.fn() });

beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage('en'); });

describe('compact navigation controls', () => {
  it('keeps directions, voice setup and explanatory copy behind optional disclosures', () => {
    const watchPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: vi.fn() } });
    const view = render(<NavigationPanel {...props()} />);
    expect(screen.getByRole('button', { name: 'Start GPS guidance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Voice guidance/ }).getAttribute('aria-pressed')).toBe('false');
    expect(view.container.querySelectorAll('details')).toHaveLength(3);
    for (const details of view.container.querySelectorAll('details')) expect(details.open).toBe(false);
    expect(screen.getByRole('button', { name: 'Test voice' }).closest('details')?.open).toBe(false);
    expect(screen.queryByText('Preview the route, or start foreground GPS guidance.')).toBeNull();
    fireEvent.click(screen.getByText('Voice settings', { selector: 'summary' }));
    expect(screen.getByRole('button', { name: 'Test voice' }).closest('details')?.open).toBe(true);
    expect(screen.getByRole('button', { name: 'Test voice' })).toBeTruthy();
    expect(screen.getByLabelText('Voice language')).toBeTruthy();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('shows a neutral locating card without a red paused warning or empty ETA while acquiring GPS', () => {
    const watchPosition = vi.fn(() => 1);
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: vi.fn() } });
    const view = render(<NavigationPanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
    expect(watchPosition).toHaveBeenCalledOnce();
    expect(view.container.querySelector('.guidance-card')?.classList.contains('guidance-acquiring')).toBe(true);
    expect(view.container.querySelector('.guidance-warning')).toBeNull();
    expect(view.container.querySelector('.navigation-metrics')).toBeNull();
    expect(screen.queryByText('Direction prompts paused')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop guidance' })).toBeTruthy();
  });

  it('keeps restriction warnings prominent with route actions safely disabled', () => {
    const view = render(<NavigationPanel {...props()} stale />);
    expect(screen.getByText('Direction prompts paused')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Restrictions changed' })).toBeTruthy();
    expect(view.container.querySelector('.guidance-warning')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Start GPS guidance' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Route guidance steps')).toBeNull();
  });
});
