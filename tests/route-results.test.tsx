// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RouteResults from '../src/components/RouteResults';
import type { PlanResponse, RouteOption } from '../shared/types';

const route: RouteOption = { id: 'detour', kind: 'detour', label: 'Avoid closure', validation: 'clear', warnings: [], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.001, 33.701]] }, distanceMeters: 1500, durationSeconds: 180,
  departureAt: '2026-10-17T10:00:00Z', arrivalAt: '2026-10-17T10:03:00Z', steps: [{ instruction: 'Continue', roadName: 'Public Street', distanceMeters: 1500, durationSeconds: 180 }], snappedOrigin: [73, 33.7], snappedDestination: [73.001, 33.701] };
const plan: PlanResponse = { options: [route], baseline: { ...route, durationSeconds: 120, distanceMeters: 1000, arrivalAt: '2026-10-17T10:02:00Z' }, conflicts: [{ closureId: 'closure', title: 'Park Road', entryAt: route.departureAt, exitAt: route.arrivalAt }], warnings: [], evaluatedAt: route.departureAt, graphVersion: 'test', eventRevision: 1, source: 'local-osm' };
const handlers = () => ({ onSelect: vi.fn(), onSaveCommute: vi.fn(), onNavigate: vi.fn(), onDemo: vi.fn(), demoBusy: false });
afterEach(cleanup);

describe('blocked route comparison', () => {
  it('opens original time/distance inspection without selecting it as a route', () => {
    const actions = handlers();
    render(<RouteResults plan={plan} selectedId={route.id} {...actions} />);
    const inspect = screen.getByRole('button', { name: 'Inspect original blocked route' });
    expect(inspect.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(inspect);
    expect(inspect.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Unavailable · comparison only')).toBeTruthy();
    expect(screen.getByText(/Without the closure:/).textContent).toContain('2 min');
    expect(actions.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    expect(actions.onNavigate).toHaveBeenCalledOnce();
  });
  it('explains fewer validated choices without inventing three route cards', () => {
    render(<RouteResults plan={plan} selectedId={route.id} {...handlers()} />);
    expect(screen.getByRole('status').textContent).toContain('1 distinct route validated.');
    expect(screen.getAllByRole('button', { name: /Recommended route/ })).toHaveLength(1);
  });
  it('keeps inspection available with no clear route and never exposes Navigate', () => {
    render(<RouteResults plan={{ ...plan, options: [] }} selectedId={null} {...handlers()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect original blocked route' }));
    expect(screen.getByText('Unavailable · comparison only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Navigate' })).toBeNull();
  });
});
