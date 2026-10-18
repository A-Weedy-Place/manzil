// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SourcePanel from '../src/components/SourcePanel';
import type { AppState } from '../shared/types';
import { setLanguage } from '../src/lib/language';
const calls = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: calls.api, send: calls.send }));
const state: AppState = { notices: [], closures: [], commutes: [], alerts: [], trips: [], eventRevision: 0,
  graph: { ready: false, source: 'fixture', version: 'fixture', nodeCount: 0, edgeCount: 0, importedAt: null, bounds: [72,33,74,35], limitations: [] },
  profile: { id: 'local', displayName: 'Fixture', theme: 'dark', mapDetail: 'clean', mapStyle: 'minimal', browserNotifications: false,
    inferFrequentRoutes: false, transport: 'car', createdAt: '2026-10-17T20:00:00Z', updatedAt: '2026-10-17T20:00:00Z' },
  sourceStatus: { enabled: true, state: 'partial', intervalMinutes: 5, coverage: 'partial', lastAttemptAt: null, noticesCollected: 0,
    profileUrl: 'https://x.com/shaheryarhassan', lastSuccessAt: null, nextCheckAt: '2026-10-17T20:00:00Z', message: 'Fixture diagnostic' } };
beforeEach(() => { setLanguage('en'); calls.api.mockReset().mockResolvedValue([]); calls.send.mockReset().mockResolvedValue({}); });
afterEach(cleanup);
it('explains the separate collection, AI and map stages and fetches without invoking Gemini', async () => {
  const reload = vi.fn(async () => {});
  render(<SourcePanel state={state} reload={reload} notify={vi.fn()} onManualClosure={vi.fn()} />);
  expect(screen.getByRole('list', { name: 'How posts reach the map' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Fetch latest posts' }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(calls.send.mock.calls).toEqual([['/source/check', {}]]);
  expect(screen.getByText('Fetching saves evidence only. It does not change the map.')).toBeTruthy();
});
it('keeps diagnostics tucked away and provides a read-only walkthrough', () => {
  const ui = render(<SourcePanel state={state} reload={vi.fn(async () => {})} notify={vi.fn()} onManualClosure={vi.fn()} />);
  const diagnostics = screen.getByText('Collection details').closest('details')!;
  expect(diagnostics.open).toBe(false);
  fireEvent.click(screen.getByText('How to demo this flow'));
  expect(ui.container.querySelector('.pipeline-help')?.hasAttribute('open')).toBe(true);
  expect(calls.send).not.toHaveBeenCalled();
});
