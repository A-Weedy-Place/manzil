// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AgentPanel from '../src/components/AgentPanel';
import type { AgentExtraction, AgentProposal, AgentResult } from '../shared/agent';
import { setLanguage } from '../src/lib/language';
import { extraction, notice } from './agent-fixtures';

const calls = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn(), uid: 'admin' as string | null }));
vi.mock('../src/lib/api', () => ({ api: calls.api, send: calls.send }));
vi.mock('../src/lib/auth', () => ({ getAuthSession: () => ({ user: calls.uid ? { uid: calls.uid } : null }) }));
beforeEach(() => { calls.uid = 'admin'; setLanguage('en'); calls.api.mockReset(); calls.send.mockReset(); });
afterEach(() => { cleanup(); setLanguage('en'); });
const status = { enabled: true, configured: true, model: 'gemini-3.1-flash-lite', autoPublish: false, canRunHere: false,
  dailyLimit: 20, attemptedToday: 1, pending: 2, runtime: { lastFinishedAt: new Date().toISOString() } };
const result = (): AgentResult & { extraction: AgentExtraction } => ({ noticeId: notice().id, noticeRevision: 1, state: 'review', extraction: extraction(), issues: ['Precise location needs review.'], closureIds: [], model: status.model, attempts: 1, claimId: 'fixture-claim', leaseUntil: 0, retryAt: 0, startedAt: notice().receivedAt });
function postTrigger() { return screen.getAllByRole('button').find(button => button.getAttribute('aria-haspopup') === 'dialog')!; }
async function openPost() { await waitFor(() => expect(postTrigger()).toBeTruthy()); fireEvent.click(postTrigger()); return within(await screen.findByRole('dialog')); }

it('prepares an older saved interpretation from its side panel without reprocessing it', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  const proposal = { index: 0, version: 'draft-version', state: 'pending', draft: { title: 'Prepared road' }, mapping: 'road' };
  calls.send.mockResolvedValue({ ...result(), proposals: [proposal] });
  const review = vi.fn(); render(<AgentPanel notices={[notice()]} onManualClosure={review} />);
  await screen.findByText('Needs review'); expect(screen.queryByText('Precise location needs review.')).toBeNull();
  const detail = await openPost(); expect(detail.getByText('Precise location needs review.')).toBeTruthy();
  fireEvent.click(detail.getByRole('button', { name: 'Review on map' })); await waitFor(() => expect(review).toHaveBeenCalledWith(notice(), proposal));
  expect(calls.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/prepare', { revision: 1 });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByText('Process pending')).toBeNull();
  fireEvent.click(screen.getByText('Pause Gemini'));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/agent/settings', { enabled: false, autoPublish: false }, 'PATCH'));
});
it('uses the Urdu summary and withholds review controls for an older revision', async () => {
  setLanguage('ur'); calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  render(<AgentPanel notices={[notice({ revision: 2 })]} onManualClosure={vi.fn()} />);
  const detail = await openPost();
  expect(detail.getByText(extraction().summaryUrdu, { exact: false })).toBeTruthy();
  expect(detail.queryByText('نقشے پر جائزہ')).toBeNull(); expect(detail.getByText('پرانا ورژن')).toBeTruthy();
});

it('keeps one compact All posts list and defers detailed evidence until a post is selected', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  render(<AgentPanel notices={[notice({ status: 'reviewed' })]} onManualClosure={vi.fn()} postsOnly />);
  await screen.findByText('Needs review');
  expect(screen.getByRole('heading', { name: 'All posts' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Waiting for AI 0/ })).toBeNull();
  expect(screen.queryByRole('region', { name: 'AI processing' })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByText('Original post')).toBeNull();
  expect(postTrigger().getAttribute('aria-expanded')).toBe('false');
  const detail = await openPost(); expect(detail.getByText('Original post')).toBeTruthy();
  expect(detail.getAllByText(notice().text)).toHaveLength(2); expect(postTrigger().getAttribute('aria-expanded')).toBe('true');
});

it('refreshes saved evidence without calling the model or changing the inbox', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  const reload = vi.fn(async () => {}); render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} onRefresh={reload} />);
  await screen.findByText('Needs review');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Gemini results' }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(calls.send).not.toHaveBeenCalled();
});

it('shows extracted timing and uncertainty, and preserves partial map updates in a review result', async () => {
  const value = result(); value.extraction.events[0].endsAt = null; value.extraction.events[0].uncertainties = ['End time not stated.'];
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [{ ...value, closureIds: ['existing-change'] }]);
  render(<AgentPanel notices={[notice({ status: 'reviewed' })]} onManualClosure={vi.fn()} />);
  await screen.findByText('Needs review');
  const detail = await openPost();
  expect(detail.getByText('Unknown — needs review')).toBeTruthy(); expect(detail.getByText('End time not stated.')).toBeTruthy();
  expect(detail.getByText('Map updated')).toBeTruthy(); expect(detail.queryByText('No map change recorded for this post version')).toBeNull();
});

it('keeps saved but unprocessed posts distinct from finished AI results', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : []);
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} />);
  await screen.findByText('Waiting for AI'); const detail = await openPost();
  expect(detail.getByText('Saved successfully. Waiting for a scheduled AI run.')).toBeTruthy();
  expect(detail.getByText('Map outcome not available yet')).toBeTruthy();
  expect(detail.getByRole('button', { name: 'Create manual restriction' })).toBeTruthy();
  expect(detail.queryByText('Needs review')).toBeNull(); expect(detail.queryByText('Map updated')).toBeNull();
});
it('keeps multiple event proposals separate, closes to the map and reflects reviewed decisions', async () => {
  const first = { index: 0, version: 'first', state: 'pending', draft: { title: 'First location' }, mapping: 'road' };
  const second = { index: 1, version: 'second', state: 'pending', draft: { title: 'Second location' }, mapping: 'unresolved' };
  const value = { ...result(), proposals: [first, second] };
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [value]);
  calls.send.mockResolvedValue(value);
  const review = vi.fn(); render(<AgentPanel notices={[notice()]} onManualClosure={review} />);
  await screen.findByText('Needs review'); let detail = await openPost();
  expect(detail.getByText('Draft ready; map location needs your help.')).toBeTruthy();
  fireEvent.click(detail.getAllByRole('button', { name: 'Review on map' })[1]); await waitFor(() => expect(review).toHaveBeenCalledWith(notice(), second));
  expect(screen.queryByRole('dialog')).toBeNull(); detail = await openPost();
  calls.send.mockResolvedValue({ result: { ...value, proposals: [{ ...first, state: 'rejected' }, { ...second, state: 'rejected' }] } });
  fireEvent.click(detail.getAllByRole('button', { name: 'Reject proposal' })[0]);
  await waitFor(() => expect(detail.getByText('Proposals rejected')).toBeTruthy());
  expect(calls.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/review', { noticeRevision: 1, index: 0, version: 'first', decision: 'reject' });
  expect(detail.queryByText('Review on map')).toBeNull();
});

it('starts a private-worker batch explicitly and then reloads saved results', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? { ...status,canRunHere: true,execution: 'private_worker' } : []);
  calls.send.mockResolvedValue({ processed: 1 }); const reload = vi.fn(async () => {});
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} onRefresh={reload} engineOnly />);
  const run = await screen.findByRole('button',{ name: 'Run Gemini now' }); fireEvent.click(run);
  await screen.findByText('Analysis batch finished. Check published updates and items needing review below.');
  expect(calls.send).toHaveBeenCalledExactlyOnceWith('/agent/run',{}); expect(reload).toHaveBeenCalledOnce();
  expect(screen.queryByRole('heading', { name: 'All posts' })).toBeNull();
});
it('opens a completed post directly when nothing remains to analyse', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? { ...status,canRunHere: true,pending: 0 } : [result()]);
  render(<AgentPanel notices={[notice({ status: 'reviewed' })]} onManualClosure={vi.fn()} />);
  await screen.findByText('Needs review');
  expect((screen.getByRole('button',{ name: 'Run Gemini now' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{ name: 'Open awaiting review (1)' }));
  expect(within(screen.getByRole('dialog')).getByText('Review on map')).toBeTruthy(); expect(calls.send).not.toHaveBeenCalled();
});
it('uses the workspace review callback in engine-only mode instead of opening hidden post details', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]); const openReview = vi.fn();
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} onOpenReview={openReview} engineOnly />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open awaiting review (1)' }));
  expect(openReview).toHaveBeenCalledOnce(); expect(screen.queryByRole('dialog')).toBeNull();
});
it('closes by Escape or outside click, preserves inside clicks and returns focus to its post', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} />); await screen.findByText('Needs review');
  const trigger = postTrigger(); trigger.focus(); const detail = await openPost();
  fireEvent.click(detail.getByText('Original post')); expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
  await openPost(); fireEvent.click(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
  expect(calls.send).not.toHaveBeenCalled();
});
it('keeps a failed review operation in the panel and retains the original pending proposal', async () => {
  const proposal = { index: 0, version: 'pending', state: 'pending', draft: { title: 'First location' }, mapping: 'road' };
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [{ ...result(), proposals: [proposal] }]);
  calls.send.mockRejectedValue(new Error('The post changed. Refresh before reviewing.'));
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} />); await screen.findByText('Needs review'); const detail = await openPost();
  fireEvent.click(detail.getByRole('button', { name: 'Reject proposal' }));
  expect(await detail.findByRole('alert')).toHaveProperty('textContent', 'The post changed. Refresh before reviewing.');
  expect(detail.getByRole('button', { name: 'Review on map' })).toBeTruthy();
});
it('loads retained images only on explicit request inside the selected post', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : path === '/source/media/fixture-notice' ? { images: [{ mimeType: 'image/png', data: 'Zml4dHVyZQ==', kind: 'photo' }] } : [result()]);
  render(<AgentPanel notices={[notice({ mediaUrls: ['https://example.test/evidence.png'] })]} onManualClosure={vi.fn()} postsOnly />);
  await screen.findByText('Needs review'); expect(calls.api.mock.calls.some(([path]) => String(path).startsWith('/source/media/'))).toBe(false);
  const detail = await openPost(); expect(detail.queryByRole('img')).toBeNull();
  fireEvent.click(detail.getByRole('button', { name: 'View source images' }));
  expect((await detail.findByRole('img', { name: 'Source evidence' })).getAttribute('src')).toBe('data:image/png;base64,Zml4dHVyZQ==');
});
it('replaces a selected old revision with new evidence and withholds stale review actions', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]); const review = vi.fn();
  const element = render(<AgentPanel notices={[notice()]} onManualClosure={review} postsOnly />);
  await screen.findByText('Needs review'); const detail = await openPost(); expect(detail.getByText('Review on map')).toBeTruthy();
  element.rerender(<AgentPanel notices={[notice({ revision: 2, text: 'Updated source evidence.' })]} onManualClosure={review} postsOnly />);
  await detail.findByText('Updated source evidence.'); expect(detail.getByText('Older version')).toBeTruthy();
  expect(detail.queryByText('Review on map')).toBeNull(); expect(review).not.toHaveBeenCalled(); expect(calls.send).not.toHaveBeenCalled();
});
it('updates an open post when shared saved results refresh without replacing the selected panel', async () => {
  const pipeline = { status, results: [result()], error: '', loading: false, refresh: vi.fn(async () => {}), update: vi.fn() };
  const element = render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} pipeline={pipeline} postsOnly />);
  const detail = await openPost(), dialog = screen.getByRole('dialog');
  expect(detail.getByText('Precise location needs review.')).toBeTruthy();
  element.rerender(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} pipeline={{ ...pipeline, results: [{ ...result(), issues: ['Updated saved analysis.'] }] }} postsOnly />);
  expect(await detail.findByText('Updated saved analysis.')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBe(dialog); expect(detail.queryByText('Precise location needs review.')).toBeNull();
  expect(calls.send).not.toHaveBeenCalled(); expect(calls.api).not.toHaveBeenCalled();
});
it('opens a bus service proposal through its dedicated review action and counts its published outcome', async () => {
  const proposal = { index: 0, version: 'bus-first', state: 'pending', kind: 'transit', action: 'closure', draft: { title: 'Blue Line suspended' }, transitDraft: { routeId: 'blue' }, mapping: 'transit' };
  const value = { ...result(), proposals: [proposal], transitDisruptionIds: ['bus-notice-1'] };
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [value]); const review = vi.fn();
  calls.send.mockResolvedValue(value);
  render(<AgentPanel notices={[notice()]} onManualClosure={review} />); await screen.findByText('Needs review'); const detail = await openPost();
  expect(detail.getByText('Map updated')).toBeTruthy(); expect(detail.queryByRole('button', { name: 'Review on map' })).toBeNull();
  fireEvent.click(detail.getByRole('button', { name: 'Review bus service' }));
  await waitFor(() => expect(review).toHaveBeenCalledWith(notice(), proposal)); expect(screen.queryByRole('dialog')).toBeNull();
});
it('re-prepares a selected legacy service event in a mixed post without opening its first road event or calling Gemini', async () => {
  const first = { index: 0, version: 'road-first', state: 'pending', draft: { title: 'Road restriction' }, mapping: 'road' };
  const legacy = { index: 1, version: 'service-old', state: 'pending', draft: { title: 'Green service suspended' }, mapping: 'road' };
  const fresh = { ...legacy, version: 'service-new', kind: 'transit', mapping: 'transit', transitDraft: { routeId: 'green', title: 'Green service suspended' }, draft: {} };
  const value = { ...result(), proposals: [first, legacy] }, review = vi.fn();
  value.extraction.events.push({ ...value.extraction.events[0], quote: 'Green Line bus service in Islamabad is suspended.', service: { route: 'Green Line', from: null, to: null, scope: 'route' } });
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [value]);
  calls.send.mockResolvedValue({ ...value, proposals: [first, fresh] });
  render(<AgentPanel notices={[notice()]} onManualClosure={review} postsOnly />); const detail = await openPost();
  fireEvent.click(detail.getAllByRole('button', { name: 'Review on map' })[1]);
  await waitFor(() => expect(review).toHaveBeenCalledWith(notice(), fresh));
  expect(calls.send).toHaveBeenCalledExactlyOnceWith('/agent/notices/fixture-notice/prepare', { revision: 1 });
  expect(review).not.toHaveBeenCalledWith(notice(), first); expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not switch to another pending event when preparation no longer returns the selected index', async () => {
  const first = { index: 0, version: 'first', state: 'pending', draft: { title: 'First road' }, mapping: 'road' };
  const second = { ...first, index: 1, version: 'second', draft: { title: 'Second road' } };
  const value = { ...result(), proposals: [first, second] }, review = vi.fn();
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [value]); calls.send.mockResolvedValue({ ...value, proposals: [first] });
  render(<AgentPanel notices={[notice()]} onManualClosure={review} postsOnly />); const detail = await openPost();
  fireEvent.click(detail.getAllByRole('button', { name: 'Review on map' })[1]);
  expect(await detail.findByRole('alert')).toHaveProperty('textContent', 'This proposal has changed. Refresh the review queue.');
  expect(review).not.toHaveBeenCalled();
});
it('does not open or update a review from a prepare response after the account changed', async () => {
  let complete!: (value: unknown) => void; calls.send.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const proposal = { index: 0, version: 'road', state: 'pending', draft: { title: 'Prepared road' }, mapping: 'road' };
  const review = vi.fn(), update = vi.fn(), pipeline = { status, results: [{ ...result(), proposals: [proposal] }] as AgentResult[], error: '', loading: false, refresh: vi.fn(async () => {}), update };
  render(<AgentPanel notices={[notice()]} onManualClosure={review} pipeline={pipeline} postsOnly />); const detail = await openPost();
  fireEvent.click(detail.getByRole('button', { name: 'Review on map' })); calls.uid = 'another-account';
  await act(async () => complete({ ...result(), proposals: [proposal] }));
  expect(review).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it('does not reopen a map editor from a prepare response after its post panel was dismissed', async () => {
  let complete!: (value: unknown) => void; calls.send.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]); const review = vi.fn();
  render(<AgentPanel notices={[notice()]} onManualClosure={review} />); await screen.findByText('Needs review'); const detail = await openPost();
  fireEvent.click(detail.getByRole('button', { name: 'Review on map' }));
  fireEvent.click(detail.getByRole('button', { name: 'Close post review' }));
  await act(async () => { complete({ ...result(), proposals: [{ index: 0, version: 'late', state: 'pending', draft: { title: 'Prepared road' }, mapping: 'road' }] }); });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(review).not.toHaveBeenCalled();
});

it.each(['reject', 'refine'] as const)('does not update shared results from a late %s response after closing the post', async action => {
  const proposal: AgentProposal = { index: 0, version: 'draft', state: 'pending', action: 'closure', impact: 'closed', draft: { title: 'Prepared road' }, mapping: action === 'refine' ? 'unresolved' : 'road', locationKey: 'road', issues: [], targetId: 'draft-road', targetRevision: null };
  const update = vi.fn(), saved = { ...result(), proposals: [proposal] };
  const pipeline = { status, results: [saved], error: '', loading: false, refresh: vi.fn(async () => {}), update };
  let complete!: (value: unknown) => void; calls.send.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} pipeline={pipeline} postsOnly />); const detail = await openPost();
  fireEvent.click(detail.getByRole('button', { name: action === 'refine' ? 'Retry map tools' : 'Reject proposal' }));
  fireEvent.click(detail.getByRole('button', { name: 'Close post review' }));
  await act(async () => { complete(action === 'refine' ? saved : { result: saved }); });
  expect(update).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
});
it('discards a prepare response when a newer source revision replaced the selected post', async () => {
  const update = vi.fn(), review = vi.fn(), pipeline = { status, results: [result()], error: '', loading: false, refresh: vi.fn(async () => {}), update };
  let complete!: (value: unknown) => void; calls.send.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const element = render(<AgentPanel notices={[notice()]} onManualClosure={review} pipeline={pipeline} postsOnly />); const detail = await openPost();
  fireEvent.click(detail.getByRole('button', { name: 'Review on map' }));
  element.rerender(<AgentPanel notices={[notice({ revision: 2, text: 'Newer road update.' })]} onManualClosure={review} pipeline={pipeline} postsOnly />);
  await detail.findByText('Newer road update.');
  await act(async () => { complete({ ...result(), proposals: [{ index: 0, version: 'late', state: 'pending', draft: { title: 'Old road' }, mapping: 'road' }] }); });
  expect(update).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled();
  expect(detail.getByText('Older version')).toBeTruthy(); expect(detail.queryByRole('button', { name: 'Review on map' })).toBeNull();
});
it('does not leak a late operation error into a reopened post panel', async () => {
  let reject!: (reason: unknown) => void; calls.send.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} />); await screen.findByText('Needs review'); const detail = await openPost();
  fireEvent.click(detail.getByRole('button', { name: 'Review on map' })); fireEvent.click(detail.getByRole('button', { name: 'Close post review' }));
  const reopened = await openPost(); await act(async () => { reject(new Error('Old request failed.')); });
  expect(reopened.queryByRole('alert')).toBeNull(); expect(reopened.getByRole('button', { name: 'Review on map' })).toBeTruthy();
});

it('opens a service proposal from the post dialog in the dedicated service editor', async () => {
  const post=notice({status:'reviewed'}),draft={routeId:'bus',title:'Synthetic service notice',description:'UI fixture only',startsAt:'2026-10-18T14:00:00Z',endsAt:'2026-10-18T15:00:00Z',status:'published'};
  const proposal={index:0,version:'service-version',kind:'transit',state:'pending',action:'closure',impact:'closed',draft:{title:draft.title},transitDraft:draft,mapping:'existing',issues:['Confirm service period.']};
  const value={...result(),proposals:[proposal]};
  const network={routes:[{id:'bus',shortName:'Blue',name:'Synthetic Blue Line'}],patterns:[],stops:[]};
  calls.api.mockImplementation(async path=>path==='/agent/status'?status:path.startsWith('/transit/network')?network:[value]);
  calls.send.mockResolvedValue(value);
  const map=vi.fn();render(<AgentPanel notices={[post]} onManualClosure={map}/>);
  const detail=await openPost();
  fireEvent.click(detail.getByRole('button',{name:'Review bus service'}));
  await waitFor(()=>expect(map).toHaveBeenCalledWith(post,proposal));
  expect(calls.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/prepare',{revision:1});
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('distinguishes automatic road publication and provides a view-only map action', async () => {
  const proposal={index:0,version:'published',state:'approved',decisionMode:'automatic',draft:{title:'Synthetic mapped restriction'},closureId:'mapped-id',issues:[]};
  calls.api.mockImplementation(async path=>path==='/agent/status'?{...status,autoPublish:true}:[{...result(),state:'applied',closureIds:['mapped-id'],proposals:[proposal]}]);
  const map=vi.fn(),editor=vi.fn();render(<AgentPanel notices={[notice({status:'reviewed'})]} onManualClosure={editor} onViewClosure={map}/>);
  await openPost();expect(await screen.findByText('Auto-published after validation')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'View on map'}));expect(map).toHaveBeenCalledWith('mapped-id');expect(editor).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:'Review on map'})).toBeNull();
});
it('renders the automatic decision and two-day provisional caption in Urdu', async () => {
  setLanguage('ur');
  const proposal={index:0,version:'published-urdu',state:'approved',decisionMode:'automatic',draft:{title:'Synthetic mapped restriction',startsAt:'2026-10-18T12:00:00Z',endsAt:'2026-10-20T12:00:00Z',description:'Provisional: two-day application expiry; source reopening time unknown.'},closureId:'mapped-id',issues:[]};
  calls.api.mockImplementation(async path=>path==='/agent/status'?{...status,autoPublish:true}:[{...result(),state:'applied',closureIds:['mapped-id'],proposals:[proposal]}]);
  render(<AgentPanel notices={[notice({status:'reviewed'})]} onManualClosure={vi.fn()}/>);
  const detail=await openPost();
  expect(detail.getByText('تصدیق کے بعد خودکار اشاعت')).toBeTruthy();
  expect(detail.getByText(/عارضی مدت: ۲ دن/)).toBeTruthy();
});
