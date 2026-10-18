// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState, Closure } from '../shared/types';
import ClosureList from '../src/components/ClosureList';
import AdminPanel from '../src/components/AdminPanel';
import { setLanguage } from '../src/lib/language';
import { notice, extraction } from './agent-fixtures';

const calls = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: calls.api, send: calls.send }));
const at = '2026-10-17T09:00:00Z';
const report: Closure = {
  id: 'report 1', revision: 7, title: 'Demo · Park Road street detour', description: '[manzil-demo:test] Repair work beside the junction.',
  reason: 'construction', startsAt: '2026-10-17T08:00:00Z', endsAt: '2026-10-17T10:00:00Z', status: 'draft', moderation: 'pending',
  createdAt: at, updatedAt: at, photoCount: 1,
  geometry: { type: 'Polygon', coordinates: [[[73, 33.7], [73.001, 33.7], [73.001, 33.701], [73, 33.7]]] },
  author: { uid: 'person', displayName: 'Ali Hassan', role: 'user' },
};
const photo = 'data:image/jpeg;base64,/9j/';
const listProps = () => ({ closures: [report], at, reviewer: false, canEdit: () => false, onSelect: vi.fn(), onEdit: vi.fn(), onCancel: vi.fn(), onReview: vi.fn(async () => {}) });
const state: AppState = {
  closures: [report], commutes: [], alerts: [], notices: [], trips: [], eventRevision: 1,
  profile: { id: 'local', displayName: 'Admin', theme: 'light', mapStyle: 'outdoors', mapDetail: 'clean', browserNotifications: false, inferFrequentRoutes: false, transport: 'car', createdAt: at, updatedAt: at },
  graph: { ready: false, source: 'fixture', version: 'test', nodeCount: 0, edgeCount: 0, importedAt: null, bounds: [72, 33, 74, 35], limitations: [] },
  sourceStatus: { enabled: false, intervalMinutes: 15, profileUrl: 'https://x.com/example', lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null, state: 'disabled', message: 'Collector is disabled.', noticesCollected: 0, coverage: 'partial' },
};
beforeEach(() => { setLanguage('en'); calls.api.mockReset().mockResolvedValue({ ...report, photos: [photo] }); calls.send.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('en'); });

it('opens on Pipeline and combines Gemini posts with community reports in the review queue', async () => {
  const post = notice({ status: 'reviewed' });
  const result = { noticeId: post.id,noticeRevision: 1,state: 'review',extraction: extraction(),issues: [],closureIds: [] };
  calls.api.mockImplementation(async path => path === '/agent/status' ? { enabled: true,configured: true,pending: 0,dailyLimit: 20,attemptedToday: 1 } : [result]);
  const props = listProps();
  render(<AdminPanel state={{ ...state,notices: [post] }} at={at} selectedId={null} reload={vi.fn(async () => {})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  expect(screen.getByRole('tab',{ name: 'Pipeline' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(await screen.findByRole('tab',{ name: 'Review queue 2' }));
  const queue = within(screen.getByRole('tabpanel',{ name: 'Review queue' }));
  expect(queue.getByText('Needs review')).toBeTruthy(); expect(queue.getByRole('button',{ name: /Park RoadPending review/ })).toBeTruthy();
  expect(queue.getByText('Review on map')).toBeTruthy();
});

it('shows the road and both Pakistan schedule times before opening report details', () => {
  render(<ClosureList {...listProps()} />);
  expect(screen.getByRole('button', { name: /Park Road/ }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByText('From')).toBeTruthy(); expect(screen.getByText('Until')).toBeTruthy();
  expect(screen.getByText(/1:00\s*pm/i)).toBeTruthy(); expect(screen.getByText(/3:00\s*pm/i)).toBeTruthy();
  expect(screen.getByText('Demo')).toBeTruthy(); expect(screen.queryByText(/manzil-demo/)).toBeNull();
  expect(calls.api).not.toHaveBeenCalled(); expect(screen.queryByRole('img')).toBeNull();
});

it('loads photo evidence and the reporter only when the road report is expanded', async () => {
  const props = listProps(); render(<ClosureList {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Park Road/ }));
  expect(calls.api).toHaveBeenCalledWith('/closures/report%201', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  const image = await screen.findByRole('img', { name: 'Closure photo 1' });
  expect(image.getAttribute('src')).toBe(photo); expect(screen.getByText('Ali Hassan')).toBeTruthy();
  expect(screen.getByText('Community member')).toBeTruthy(); expect(screen.getByText('Repair work beside the junction.')).toBeTruthy();
  expect(props.onSelect).toHaveBeenCalledWith(report);
});

it('allows an ordinary member to read a pending report without approving someone else’s closure', async () => {
  render(<ClosureList {...listProps()} />); fireEvent.click(screen.getByRole('button', { name: /Park Road/ }));
  await screen.findByRole('img', { name: 'Closure photo 1' });
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
});

it('passes the freshest loaded revision to the reviewer’s approval callback', async () => {
  const refreshed: Closure = { ...report, revision: 8, description: 'Updated location evidence.', photos: [photo] };
  calls.api.mockResolvedValue(refreshed);
  const props = listProps(); render(<ClosureList {...props} reviewer />);
  fireEvent.click(screen.getByRole('button', { name: /Park Road/ })); await screen.findByText('Updated location evidence.');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(props.onReview).toHaveBeenCalledWith(expect.objectContaining({ id: report.id, revision: 8 }), 'approve'));
});

it('excludes cancelled pending reports from the admin queue and never offers approval for them', async () => {
  const cancelled: Closure = { ...report, id: 'withdrawn', title: 'Kaghan Road', status: 'cancelled' };
  calls.api.mockResolvedValue(cancelled);
  const props = listProps();
  render(<AdminPanel state={{ ...state, closures: [cancelled] }} at={at} selectedId={null} reload={vi.fn(async () => {})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Blockades' }));
  expect(screen.getByText('No closures here')).toBeTruthy(); expect(screen.queryByRole('button', { name: /Kaghan Road/ })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Report filter' }), { target: { value: 'all' } });
  fireEvent.click(screen.getByRole('button', { name: /Kaghan Road/ })); await screen.findByText('Ali Hassan');
  expect(screen.getByText('cancelled')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it('lets an admin verify and unverify a person, updating the displayed role after each API response', async () => {
  calls.api.mockResolvedValue({ users: [{ uid: 'person 2', displayName: 'Sara', email: 'sara@example.test', role: 'user', verified: false, disabled: false }] });
  calls.send.mockResolvedValueOnce({ uid: 'person 2', role: 'verified', verified: true }).mockResolvedValueOnce({ uid: 'person 2', role: 'user', verified: false });
  const props = listProps();
  render(<AdminPanel state={state} at={at} selectedId={null} reload={vi.fn(async () => {})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'People' })); await screen.findByText('Sara');
  const panel = within(screen.getByRole('tabpanel', { name: 'People' }));
  fireEvent.click(panel.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/admin/users/person%202', { verified: true }, 'PATCH'));
  expect(await panel.findByText('Verified contributor')).toBeTruthy();
  fireEvent.click(panel.getByRole('button', { name: 'Remove verification' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/admin/users/person%202', { verified: false }, 'PATCH'));
  expect(await panel.findByText('Community member')).toBeTruthy();
});
