// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AgentPanel from '../src/components/AgentPanel';
import { setLanguage } from '../src/lib/language';
import { extraction, notice } from './agent-fixtures';

const calls = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: calls.api, send: calls.send }));
beforeEach(() => { setLanguage('en'); calls.api.mockReset(); calls.send.mockReset(); });
afterEach(cleanup);
const status = { enabled: true, configured: true, model: 'gemini-3.1-flash-lite', autoPublish: false, canRunHere: false,
  dailyLimit: 20, attemptedToday: 1, pending: 2, runtime: { lastFinishedAt: new Date().toISOString() } };
const result = () => ({ noticeId: notice().id, noticeRevision: 1, state: 'review', extraction: extraction(), issues: ['Precise location needs review.'] });
it('prepares an older saved interpretation before opening its populated map proposal without reprocessing it', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  const proposal = { index: 0, version: 'draft-version', state: 'pending', draft: { title: 'Prepared road' }, mapping: 'road' };
  calls.send.mockResolvedValue({ ...result(), proposals: [proposal] });
  const review = vi.fn(); render(<AgentPanel notices={[notice()]} onManualClosure={review} />);
  await screen.findByText('Needs review'); expect(screen.getByText('Precise location needs review.')).toBeTruthy();
  fireEvent.click(screen.getByText('Review on map')); await waitFor(() => expect(review).toHaveBeenCalledWith(notice(), proposal));
  expect(calls.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/prepare', { revision: 1 });
  expect(screen.queryByText('Process pending')).toBeNull();
  fireEvent.click(screen.getByText('Pause Gemini'));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/agent/settings', { enabled: false, autoPublish: false }, 'PATCH'));
});
it('uses the Urdu summary and withholds the review action for an older revision', async () => {
  setLanguage('ur'); calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  render(<AgentPanel notices={[notice({ revision: 2 })]} onManualClosure={vi.fn()} />);
  await screen.findByText(extraction().summaryUrdu, { exact: false });
  expect(screen.queryByText('نقشے پر جائزہ')).toBeNull(); expect(screen.getByText('پرانا ورژن')).toBeTruthy();
});

it('shows processed posts by default and explains why the waiting queue is empty', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [result()]);
  render(<AgentPanel notices={[notice({ status: 'reviewed' })]} onManualClosure={vi.fn()} />);
  await screen.findByText('Needs review');
  expect(screen.getByRole('button', { name: 'All posts 1' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Waiting for AI 0' }));
  expect(screen.getByText('Nothing waiting for AI')).toBeTruthy();
  expect(screen.getByText('Choose All posts to see processed posts and their outcomes.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'All posts 1' }));
  expect(screen.getByText('Needs review')).toBeTruthy();
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
  const ui = render(<AgentPanel notices={[notice({ status: 'reviewed' })]} onManualClosure={vi.fn()} />);
  await screen.findByText('Needs review');
  ui.container.querySelector('details')!.open = true;
  expect(screen.getByText('Unknown — needs review')).toBeTruthy(); expect(screen.getByText('End time not stated.')).toBeTruthy();
  expect(screen.getByText('Map updated')).toBeTruthy(); expect(screen.queryByText('No map change recorded for this post version')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Map changes 1' }));
  expect(screen.getByText('Needs review')).toBeTruthy();
});

it('keeps saved but unprocessed posts distinct from finished AI results', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : []);
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} />);
  await screen.findByText('Saved successfully. Waiting for a scheduled AI run.');
  expect(screen.getByText('Map outcome not available yet')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Waiting for AI 1' })).toBeTruthy();
  expect(screen.queryByText('Needs review')).toBeNull(); expect(screen.queryByText('Map updated')).toBeNull();
});
it('keeps multiple event proposals separate and removes rejected decisions from Needs attention', async () => {
  const first = { index: 0, version: 'first', state: 'pending', draft: { title: 'First location' }, mapping: 'road' };
  const second = { index: 1, version: 'second', state: 'pending', draft: { title: 'Second location' }, mapping: 'unresolved' };
  const value = { ...result(), proposals: [first, second] };
  calls.api.mockImplementation(async path => path === '/agent/status' ? status : [value]);
  const review = vi.fn(); render(<AgentPanel notices={[notice()]} onManualClosure={review} />);
  await screen.findByText('Draft ready; map location needs your help.');
  fireEvent.click(screen.getAllByText('Review on map')[1]); expect(review).toHaveBeenCalledWith(notice(), second);
  calls.send.mockResolvedValue({ result: { ...value, proposals: [{ ...first, state: 'rejected' }, { ...second, state: 'rejected' }] } });
  fireEvent.click(screen.getAllByText('Reject proposal')[0]);
  await screen.findByText('Proposals rejected');
  expect(calls.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/review', { noticeRevision: 1, index: 0, version: 'first', decision: 'reject' });
  expect(screen.queryByText('Review on map')).toBeNull();
  expect(screen.getByRole('button', { name: 'Needs attention 0' })).toBeTruthy();
});

it('starts a private-worker batch explicitly and then reloads saved results', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? { ...status,canRunHere: true,execution: 'private_worker' } : []);
  calls.send.mockResolvedValue({ processed: 1 }); const reload = vi.fn(async () => {});
  render(<AgentPanel notices={[notice()]} onManualClosure={vi.fn()} onRefresh={reload} />);
  const run = await screen.findByRole('button',{ name: 'Run Gemini now' }); fireEvent.click(run);
  await screen.findByText('Analysis batch finished. Check published updates and items needing review below.');
  expect(calls.send).toHaveBeenCalledExactlyOnceWith('/agent/run',{}); expect(reload).toHaveBeenCalledOnce();
});
it('keeps completed posts reviewable when there is nothing left to analyse', async () => {
  calls.api.mockImplementation(async path => path === '/agent/status' ? { ...status,canRunHere: true,pending: 0 } : [result()]);
  render(<AgentPanel notices={[notice({ status: 'reviewed' })]} onManualClosure={vi.fn()} />);
  await screen.findByText('Needs review');
  expect((screen.getByRole('button',{ name: 'Run Gemini now' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{ name: 'Open awaiting review (1)' }));
  expect(screen.getByText('Review on map')).toBeTruthy(); expect(calls.send).not.toHaveBeenCalled();
});

it('reviews a service window inside Pipeline without opening the road editor', async () => {
  const post=notice({status:'reviewed'}),draft={routeId:'bus',title:'Synthetic service notice',description:'UI fixture only',startsAt:'2026-10-18T14:00:00Z',endsAt:'2026-10-18T15:00:00Z',status:'published'};
  const proposal={index:0,version:'service-version',kind:'transit',state:'pending',action:'closure',impact:'closed',draft:{title:draft.title},transitDraft:draft,mapping:'existing',issues:['Confirm service period.']};
  const value={...result(),proposals:[proposal]};
  const network={routes:[{id:'bus',shortName:'Blue',name:'Synthetic Blue Line'}],patterns:[],stops:[]};
  calls.api.mockImplementation(async path=>path==='/agent/status'?status:path.startsWith('/transit/network')?network:[value]);
  calls.send.mockResolvedValue({result:{...value,state:'applied',transitIds:['service'],proposals:[{...proposal,state:'approved',decisionMode:'admin'}]}});
  const map=vi.fn();render(<AgentPanel notices={[post]} onManualClosure={map}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Review service notice'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Approve service suspension'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.submit(screen.getByRole('button',{name:'Approve service suspension'}).closest('form')!);
  await waitFor(()=>expect(calls.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/review',expect.objectContaining({noticeRevision:1,index:0,decision:'approve',transitDraft:expect.objectContaining({routeId:'bus',startsAt:'2026-10-18T14:00:00.000Z',endsAt:'2026-10-18T15:00:00.000Z'})})));
  expect(map).not.toHaveBeenCalled();expect(await screen.findByText('Metro / bus availability updated in Local journeys.')).toBeTruthy();
});

it('distinguishes automatic road publication and provides a view-only map action', async () => {
  const proposal={index:0,version:'published',state:'approved',decisionMode:'automatic',draft:{title:'Synthetic mapped restriction'},closureId:'mapped-id',issues:[]};
  calls.api.mockImplementation(async path=>path==='/agent/status'?{...status,autoPublish:true}:[{...result(),state:'applied',closureIds:['mapped-id'],proposals:[proposal]}]);
  const map=vi.fn(),editor=vi.fn();render(<AgentPanel notices={[notice({status:'reviewed'})]} onManualClosure={editor} onViewClosure={map}/>);
  expect(await screen.findByText('Auto-published after validation')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'View on map'}));expect(map).toHaveBeenCalledWith('mapped-id');expect(editor).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:'Review on map'})).toBeNull();
});
