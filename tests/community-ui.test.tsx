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

it('uses workspace-selected sections and combines Gemini posts with community reports in Review queue', async () => {
  const post = notice({ status: 'reviewed' });
  const result = { noticeId: post.id,noticeRevision: 1,state: 'review',extraction: extraction(),issues: [],closureIds: [] };
  calls.api.mockImplementation(async path => path === '/agent/status' ? { enabled: true,configured: true,pending: 0,dailyLimit: 20,attemptedToday: 1 } : [result]);
  const props = listProps();
  const common = { state: { ...state, notices: [post] }, at, selectedId: null, reload: vi.fn(async () => {}), notify: vi.fn(), onSelect: props.onSelect, onEdit: props.onEdit, onCancel: props.onCancel, onReview: props.onReview, onManualClosure: vi.fn() };
  const element = render(<AdminPanel {...common} />);
  expect(screen.getByRole('heading', { name: 'Pipelines' })).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
  element.rerender(<AdminPanel {...common} initialTab="review" />);
  const queue = within(screen.getByRole('tabpanel', { name: 'Review queue' }));
  expect(await queue.findByText('Needs review')).toBeTruthy(); expect(queue.getByRole('button', { name: /Park RoadPending review/ })).toBeTruthy();
  expect(queue.queryByText('Review on map')).toBeNull();
  fireEvent.click(queue.getByRole('button', { name: /Needs review.*Park Road closure announced/ }));
  expect(within(screen.getByRole('dialog', { name: 'Post review' })).getByText('Review on map')).toBeTruthy();
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
  const common = { state: { ...state, closures: [cancelled] }, at, selectedId: null, reload: vi.fn(async () => {}), notify: vi.fn(), onSelect: props.onSelect, onEdit: props.onEdit, onCancel: props.onCancel, onReview: props.onReview, onManualClosure: vi.fn() };
  const element = render(<AdminPanel {...common} initialTab="review" />);
  expect(screen.getByText('No closures here')).toBeTruthy(); expect(screen.queryByRole('button', { name: /Kaghan Road/ })).toBeNull();
  element.rerender(<AdminPanel {...common} initialTab="reports" />);
  expect(screen.getByRole('heading', { name: 'Road closures' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Kaghan Road/ })); await screen.findByText('Ali Hassan');
  expect(screen.getByText('cancelled')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it('lets an admin verify and unverify a person, updating the displayed role after each API response', async () => {
  calls.api.mockResolvedValue({ users: [{ uid: 'person 2', displayName: 'Sara', email: 'sara@example.test', role: 'user', verified: false, disabled: false }] });
  calls.send.mockResolvedValueOnce({ uid: 'person 2', role: 'verified', verified: true }).mockResolvedValueOnce({ uid: 'person 2', role: 'user', verified: false });
  const props = listProps();
  render(<AdminPanel state={state} initialTab="users" at={at} selectedId={null} reload={vi.fn(async () => {})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  await screen.findByText('Sara');
  const panel = within(screen.getByRole('tabpanel', { name: 'Users' }));
  fireEvent.click(panel.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/admin/users/person%202', { verified: true }, 'PATCH'));
  expect(await panel.findByText('Verified contributor')).toBeTruthy();
  fireEvent.click(panel.getByRole('button', { name: 'Remove verification' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/admin/users/person%202', { verified: false }, 'PATCH'));
  expect(await panel.findByText('Not verified')).toBeTruthy();
});

it('confirms administrator grants and removals, keeps self access protected, and filters loaded users', async () => {
  calls.api.mockResolvedValue({ users: [
    {uid:'self',displayName:'Owner',role:'admin',verified:true,disabled:false},
    {uid:'person 2',displayName:'Sara',email:'sara@example.test',role:'user',verified:false,disabled:false},
  ] });
  calls.send.mockResolvedValueOnce({uid:'person 2',role:'admin',verified:true}).mockResolvedValueOnce({uid:'person 2',role:'user',verified:false});
  const props = listProps();
  render(<AdminPanel state={{...state,membership:{uid:'self',role:'admin',verified:true}}} initialTab="users" at={at} selectedId={null} reload={vi.fn(async()=>{})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  const sara = within(await screen.findByRole('article',{name:'Sara'}));
  const owner = within(screen.getByRole('article',{name:'Owner'}));
  expect(owner.queryByRole('button',{name:'Remove admin'})).toBeNull();
  expect(owner.getByText('Your account')).toBeTruthy();
  fireEvent.click(sara.getByRole('button',{name:'Make admin'}));
  expect(calls.send).not.toHaveBeenCalled();
  fireEvent.click(sara.getByRole('button',{name:'Cancel'}));
  expect(sara.queryByRole('group',{name:'Confirm role change'})).toBeNull();
  fireEvent.click(sara.getByRole('button',{name:'Make admin'}));
  fireEvent.click(sara.getByRole('button',{name:'Confirm'}));
  await waitFor(()=>expect(calls.send).toHaveBeenCalledWith('/admin/users/person%202',{admin:true},'PATCH'));
  fireEvent.click(await sara.findByRole('button',{name:'Remove admin'}));
  fireEvent.click(sara.getByRole('button',{name:'Confirm'}));
  await waitFor(()=>expect(calls.send).toHaveBeenCalledWith('/admin/users/person%202',{admin:false},'PATCH'));
  expect(await screen.findByText('User access updated.')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'sara@example'}});
  expect(screen.queryByRole('article',{name:'Owner'})).toBeNull(); expect(screen.getByRole('article',{name:'Sara'})).toBeTruthy();
});

it('retains paginated users and exposes a loading state and directory failure', async () => {
  calls.api.mockImplementation(async path=>path==='/admin/users' ? {users:[{uid:'one',displayName:'First',role:'user',verified:false,disabled:false}],nextPageToken:'next page'} : path==='/admin/users?pageToken=next%20page' ? {users:[{uid:'two',displayName:'Second',role:'user',verified:false,disabled:false}]} : {});
  const props = listProps();
  render(<AdminPanel state={state} initialTab="users" at={at} selectedId={null} reload={vi.fn(async()=>{})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  expect(screen.getByText('Loading users…')).toBeTruthy();
  await screen.findByRole('article',{name:'First'});
  fireEvent.click(screen.getByRole('button',{name:'Load more users'}));
  await screen.findByRole('article',{name:'Second'}); expect(screen.getByRole('article',{name:'First'})).toBeTruthy();
  calls.api.mockRejectedValue(new Error('Directory unavailable.'));
  fireEvent.click(screen.getByRole('button',{name:'Refresh users'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Directory unavailable.');
  expect(screen.getByRole('article',{name:'First'})).toBeTruthy();
});


it('shows only returned profile-directory and sharing status, keeping unknown sharing distinct from off', async () => {
  calls.api.mockResolvedValue({ users: [
    { uid: 'one', displayName: 'Sharing user', city: 'Rawalpindi', travelDataSharing: true, role: 'verified', verified: true, disabled: false },
    { uid: 'two', displayName: 'Private user', travelDataSharing: false, role: 'user', verified: false, disabled: false },
    { uid: 'three', displayName: 'No profile yet', travelDataSharing: null, role: 'user', verified: false, disabled: false },
  ] });
  const props = listProps(); render(<AdminPanel state={state} initialTab="users" at={at} selectedId={null} reload={vi.fn(async () => {})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  const sharing = within(await screen.findByRole('article', { name: 'Sharing user' }));
  expect(sharing.getByText('Rawalpindi')).toBeTruthy(); expect(sharing.getByText('Trip data sharing: Allowed')).toBeTruthy();
  expect(within(screen.getByRole('article', { name: 'Private user' })).getByText('Trip data sharing: Off')).toBeTruthy();
  expect(within(screen.getByRole('article', { name: 'No profile yet' })).getByText('Trip data sharing: Unknown')).toBeTruthy();
});
it('retains the previous user role when verification is rejected by current server authority', async () => {
  calls.api.mockResolvedValue({ users: [{ uid: 'one', displayName: 'Sara', role: 'user', verified: false, disabled: false }] });
  calls.send.mockRejectedValue(new Error('Administrator access required.'));
  const props = listProps(); render(<AdminPanel state={state} initialTab="users" at={at} selectedId={null} reload={vi.fn(async () => {})} notify={vi.fn()} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} onManualClosure={vi.fn()} />);
  const member = within(await screen.findByRole('article', { name: 'Sara' })); fireEvent.click(member.getByRole('button', { name: 'Verify' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Administrator access required.');
  expect(member.getByText('Not verified')).toBeTruthy(); expect(member.queryByText('Verified contributor')).toBeNull();
});
it('keeps approval unavailable after evidence loading fails and retries to the latest revision', async () => {
  calls.api.mockRejectedValueOnce(new Error('Evidence unavailable.')).mockResolvedValueOnce({ ...report, revision: 9, photos: [photo] });
  const props = listProps(); render(<ClosureList {...props} reviewer />); fireEvent.click(screen.getByRole('button', { name: /Park Road/ }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Evidence unavailable.');
  expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByRole('img', { name: 'Closure photo 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(props.onReview).toHaveBeenCalledWith(expect.objectContaining({ revision: 9 }), 'approve'));
});
