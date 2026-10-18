// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SourcePanel from '../src/components/SourcePanel';
import type { AppState } from '../shared/types';
import { setLanguage } from '../src/lib/language';
import { extraction, notice } from './agent-fixtures';
const calls = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: calls.api, send: calls.send }));
const state: AppState = { notices: [], closures: [], commutes: [], alerts: [], trips: [], eventRevision: 0,
  graph: { ready: false, source: 'fixture', version: 'fixture', nodeCount: 0, edgeCount: 0, importedAt: null, bounds: [72,33,74,35], limitations: [] },
  profile: { id: 'local', displayName: 'Fixture', theme: 'dark', mapDetail: 'clean', mapStyle: 'minimal', browserNotifications: false,
    inferFrequentRoutes: false, transport: 'car', createdAt: '2026-10-17T20:00:00Z', updatedAt: '2026-10-17T20:00:00Z' },
  sourceStatus: { enabled: true, state: 'partial', intervalMinutes: 5, coverage: 'partial', lastAttemptAt: null, noticesCollected: 0,
    profileUrl: 'https://x.com/shaheryarhassan', lastSuccessAt: null, nextCheckAt: '2026-10-17T20:00:00Z', message: 'Fixture diagnostic' } };
const status = { enabled: false, configured: false, model: 'gemini-3.1-flash-lite', autoPublish: false, canRunHere: false,
  dailyLimit: 20, attemptedToday: 0, pending: 0, runtime: null };
beforeEach(() => { setLanguage('en'); calls.api.mockReset().mockImplementation(async path => path === '/agent/status' ? status : []); calls.send.mockReset().mockResolvedValue({}); });
afterEach(() => { cleanup(); setLanguage('en'); });
function collection() { return screen.getByText('Champ Alerts').closest('details')!; }
function openCollection() { const card = collection(); fireEvent.click(within(card).getByText('Champ Alerts')); return within(card); }
function analysis() { return screen.getByText('Gemini analysis').closest('details')!; }

it('keeps pipeline controls collapsed beside one All posts list without running a collector or model', async () => {
  render(<SourcePanel state={state} reload={vi.fn(async () => {})} notify={vi.fn()} onManualClosure={vi.fn()} />);
  expect(collection().open).toBe(false); expect(analysis().open).toBe(false);
  expect(screen.getByRole('heading', { name: 'All posts' })).toBeTruthy(); expect(screen.getByRole('heading', { name: 'No posts collected yet' })).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'How posts reach the map' })).toBeNull();
  await waitFor(() => expect(calls.api).toHaveBeenCalledWith('/agent/results'));
  expect(calls.api.mock.calls.map(([path]) => path).sort()).toEqual(['/agent/results', '/agent/status']);
  expect(calls.send).not.toHaveBeenCalled();
});
it('fetches evidence explicitly and refreshes saved analysis without invoking Gemini or changing the map', async () => {
  const reload = vi.fn(async () => {}), notify = vi.fn();
  render(<SourcePanel state={state} reload={reload} notify={notify} onManualClosure={vi.fn()} />);
  const collector = openCollection(); expect(collector.getByText('Scheduled checks every 5 minutes')).toBeTruthy();
  expect(collector.getByText('Public-page coverage is partial. Missing posts do not mean roads are clear.')).toBeTruthy();
  fireEvent.click(collector.getByRole('button', { name: 'Fetch latest posts' }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  await waitFor(() => expect(notify).toHaveBeenCalledWith('Posts checked. New or edited posts wait for the next AI run.'));
  expect(calls.send.mock.calls).toEqual([['/source/check', {}]]);
  expect(calls.api.mock.calls.every(([path]) => ['/agent/status', '/agent/results'].includes(path))).toBe(true);
});
it('keeps diagnostics nested until requested and opening or closing them is read-only', async () => {
  render(<SourcePanel state={state} reload={vi.fn(async () => {})} notify={vi.fn()} onManualClosure={vi.fn()} />);
  const collector = openCollection(), diagnostics = collector.getByText('Collection details').closest('details')!;
  expect(diagnostics.open).toBe(false); fireEvent.click(collector.getByText('Collection details')); expect(diagnostics.open).toBe(true);
  expect(collector.getByText('Fixture diagnostic')).toBeTruthy();
  fireEvent.click(collector.getByText('Collection details')); expect(diagnostics.open).toBe(false);
  fireEvent.click(screen.getByText('Gemini analysis')); expect(analysis().open).toBe(true);
  await waitFor(() => expect(within(analysis()).getAllByText('Not configured').length).toBeGreaterThan(0));
  expect(screen.queryByText('How to demo this flow')).toBeNull(); expect(calls.send).not.toHaveBeenCalled();
});
it('keeps an in-flight fetch disabled and returns collector errors without starting another pipeline', async () => {
  let reject!: (reason: unknown) => void; calls.send.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const reload = vi.fn(async () => {}); render(<SourcePanel state={state} reload={reload} notify={vi.fn()} onManualClosure={vi.fn()} />);
  const collector = openCollection(); fireEvent.click(collector.getByRole('button', { name: 'Fetch latest posts' }));
  const fetching = collector.getByRole('button', { name: 'Fetching…' }) as HTMLButtonElement;
  expect(fetching.disabled).toBe(true); fireEvent.click(fetching); expect(calls.send).toHaveBeenCalledOnce();
  await act(async () => { reject(new Error('Public source is temporarily unavailable.')); });
  expect(screen.getByRole('alert').textContent).toBe('Public source is temporarily unavailable.');
  expect((collector.getByRole('button', { name: 'Fetch latest posts' }) as HTMLButtonElement).disabled).toBe(false);
  expect(reload).toHaveBeenCalledOnce(); expect(calls.send.mock.calls).toEqual([['/source/check', {}]]);
});
it('changes collector scheduling only after its explicit control is clicked', async () => {
  const reload = vi.fn(async () => {}), element = render(<SourcePanel state={state} reload={reload} notify={vi.fn()} onManualClosure={vi.fn()} />);
  const collector = openCollection(); expect(calls.send).not.toHaveBeenCalled();
  fireEvent.click(collector.getByRole('button', { name: 'Pause collector' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/source/settings', { enabled: false }, 'PATCH'));
  expect(reload).toHaveBeenCalledOnce();
  element.rerender(<SourcePanel state={{ ...state, sourceStatus: { ...state.sourceStatus, enabled: false } }} reload={reload} notify={vi.fn()} onManualClosure={vi.fn()} />);
  fireEvent.click(collector.getByRole('button', { name: 'Resume collector' }));
  await waitFor(() => expect(calls.send).toHaveBeenLastCalledWith('/source/settings', { enabled: true }, 'PATCH'));
  expect(calls.send.mock.calls.every(([path]) => path === '/source/settings')).toBe(true);
});
it('imports a notice with its evidenced PKT publication time into the inbox without running AI', async () => {
  const reload = vi.fn(async () => {}), notify = vi.fn(); render(<SourcePanel state={state} reload={reload} notify={notify} onManualClosure={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import a notice manually' }));
  fireEvent.change(screen.getByLabelText('Notice text'), { target: { value: 'Blue Line closed from 5 to 6 pm.' } });
  fireEvent.change(screen.getByLabelText('Original source link'), { target: { value: 'https://example.test/announcement' } });
  fireEvent.input(screen.getByLabelText(/Original publication time/), { target: { value: '2026-10-18T16:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith('Post saved. It is waiting for AI analysis.'));
  expect(calls.send).toHaveBeenCalledExactlyOnceWith('/notices', { text: 'Blue Line closed from 5 to 6 pm.', url: 'https://example.test/announcement', publishedAt: '2026-10-18T11:30:00.000Z' });
  expect(screen.queryByLabelText('Notice text')).toBeNull(); expect(reload).toHaveBeenCalledOnce();
});
it('leaves an unknown publication time explicit rather than deriving it from import time', async () => {
  render(<SourcePanel state={state} reload={vi.fn(async () => {})} notify={vi.fn()} onManualClosure={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import a notice manually' }));
  fireEvent.change(screen.getByLabelText('Notice text'), { target: { value: 'Public source announcement.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add to inbox' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledExactlyOnceWith('/notices', { text: 'Public source announcement.', url: undefined, publishedAt: null }));
});
it('opens saved analysis in its adjacent post panel without collecting or analysing again', async () => {
  const value = { noticeId: notice().id, noticeRevision: 1, state: 'review', extraction: extraction(), issues: [], closureIds: [] };
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [value]);
  render(<SourcePanel state={{ ...state, notices: [notice()] }} reload={vi.fn(async () => {})} notify={vi.fn()} onManualClosure={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Needs review.*Park Road closure announced/ }));
  const dialog = within(screen.getByRole('dialog', { name: 'Post review' }));
  expect(dialog.getByRole('heading', { name: 'Original post' })).toBeTruthy(); expect(dialog.getByRole('heading', { name: 'Gemini analysis' })).toBeTruthy();
  expect(calls.send).not.toHaveBeenCalled();
});
