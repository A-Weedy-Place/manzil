// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Closure } from '../shared/types';
import ClosureList from '../src/components/ClosureList';
import { setLanguage } from '../src/lib/language';

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: mock.api }));
const at = '2026-10-18T08:00:00Z';
const report: Closure = { id: 'community-report', revision: 1, title: 'Kaghan Road', description: 'Barriers at the junction', reason: 'construction',
  status: 'draft', moderation: 'pending', startsAt: at, endsAt: null, createdAt: at, updatedAt: at, photoCount: 6,
  author: { uid: 'member', displayName: 'Ayesha', role: 'user' },
  geometry: { type: 'Polygon', coordinates: [[[73.04,33.7],[73.041,33.7],[73.041,33.701],[73.04,33.7]]] } };
const full: Closure = { ...report, photos: Array.from({ length: 6 }, (_, index) => `data:image/png;base64,photo${index}`), sourceUrl: 'https://example.test/notice' };
function props() { return { closures: [report], at, reviewer: true, canEdit: () => false, onSelect: vi.fn(), onEdit: vi.fn(), onCancel: vi.fn(), onReview: vi.fn(async () => {}) }; }
function expand() { fireEvent.click(screen.getByRole('button', { name: /Kaghan Road/ })); }
beforeEach(() => { mock.api.mockReset().mockResolvedValue(full); setLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps reports compact until opened and shows unknown expiry without suggesting the road reopened', () => {
  const callbacks = props(); render(<ClosureList {...callbacks} />);
  expect(screen.getByText('Pending review')).toBeTruthy(); expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.queryByText('Reopened')).toBeNull(); expect(screen.queryByRole('img')).toBeNull(); expect(mock.api).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it('loads the full evidence only on expansion and holds both review decisions until it arrives', async () => {
  let resolve!: (value: Closure) => void; mock.api.mockReturnValueOnce(new Promise<Closure>(done => { resolve = done; }));
  const callbacks = props(); render(<ClosureList {...callbacks} />); expand();
  expect(callbacks.onSelect).toHaveBeenCalledWith(report); expect(screen.getByRole('status').textContent).toBe('Loading report…');
  expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Approve' })); expect(callbacks.onReview).not.toHaveBeenCalled();
  await act(async () => resolve(full));
  expect(screen.getAllByRole('img')).toHaveLength(6); expect(screen.getByText('Ayesha')).toBeTruthy();
  expect(screen.getByText('Community member')).toBeTruthy(); expect(screen.getByText('Roadworks')).toBeTruthy();
  expect(screen.getByText('Barriers at the junction')).toBeTruthy(); expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toBe(full.sourceUrl);
  expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false);
  expect(mock.api).toHaveBeenCalledWith('/closures/community-report', { signal: expect.any(AbortSignal) });
  fireEvent.click(screen.getByRole('button', { name: 'View on map' })); expect(callbacks.onSelect).toHaveBeenLastCalledWith(full);
});

it('reviews the fetched revision once and disables decisions during the save', async () => {
  const latest = { ...full, revision: 2 }; mock.api.mockResolvedValue(latest);
  let resolve!: () => void; const callbacks = props(); callbacks.onReview.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  render(<ClosureList {...callbacks} />); expand(); await screen.findAllByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(callbacks.onReview).toHaveBeenCalledWith(latest, 'approve'); expect(callbacks.onReview).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reject' })); expect(callbacks.onReview).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
});

it('keeps evidence failures visible, prevents approval and retries the report without losing the card', async () => {
  mock.api.mockRejectedValueOnce(new Error('Details unavailable.')).mockResolvedValueOnce(full);
  const callbacks = props(); render(<ClosureList {...callbacks} />); expand();
  expect((await screen.findByRole('alert')).textContent).toBe('Details unavailable.');
  expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findAllByRole('img');
  expect(screen.queryByRole('alert')).toBeNull(); expect(mock.api).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Reject' })); await waitFor(() => expect(callbacks.onReview).toHaveBeenCalledWith(full, 'reject'));
});

it('aborts a closed detail request and keeps stale evidence from enabling a newer report revision', async () => {
  let oldResolve!: (value: Closure) => void;
  mock.api.mockReturnValueOnce(new Promise<Closure>(done => { oldResolve = done; })).mockReturnValue(new Promise(() => {}));
  const callbacks = props(); const { rerender } = render(<ClosureList {...callbacks} />); expand();
  const signal = mock.api.mock.calls[0][1].signal as AbortSignal;
  rerender(<ClosureList {...callbacks} closures={[{ ...report, revision: 2 }]} />);
  expect(signal.aborted).toBe(true); await act(async () => oldResolve(full));
  expect(screen.queryByRole('img')).toBeNull(); expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Kaghan Road/ }));
  expect((mock.api.mock.calls[1][1].signal as AbortSignal).aborted).toBe(true); expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
});

it('does not show review controls to an ordinary member or for a resolved report', async () => {
  const callbacks = props(); const { rerender } = render(<ClosureList {...callbacks} reviewer={false} />); expand(); await screen.findAllByRole('img');
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  const approved = { ...full, status: 'published' as const, moderation: 'approved' as const, revision: 2, reviewedBy: { uid: 'reviewer', displayName: 'Bilal', role: 'verified' as const } };
  mock.api.mockResolvedValueOnce(approved); rerender(<ClosureList {...callbacks} closures={[approved]} />);
  await screen.findByText(/Bilal/); expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
});

it('shows review failures as an accessible alert while preserving the evidence for another attempt', async () => {
  const callbacks = props(); callbacks.onReview.mockRejectedValueOnce(new Error('This report is no longer awaiting review.'));
  render(<ClosureList {...callbacks} />); expand(); await screen.findAllByRole('img'); fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect((await screen.findByRole('alert')).textContent).toContain('no longer awaiting review'); expect(screen.getAllByRole('img')).toHaveLength(6);
});
