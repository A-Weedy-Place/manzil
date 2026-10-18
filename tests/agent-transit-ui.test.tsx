// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TransitProposalEditor from '../src/components/TransitProposalEditor';
import type { AgentProposal, AgentProposalDecision, AgentResult } from '../shared/agent';
import type { TransitNetwork } from '../shared/transit';
import { setLanguage } from '../src/lib/language';
import { extraction, notice } from './agent-fixtures';
const mocks = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn(), uid: 'admin' as string | null }));
vi.mock('../src/lib/api', () => ({ api: mocks.api, send: mocks.send }));
vi.mock('../src/lib/auth', () => ({ getAuthSession: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
const at = '2027-01-15T12:00:00Z';
const network: TransitNetwork = { version: 'fixture', importedAt: at, evaluatedAt: at, eventRevision: 0, disruptionRevision: 0,
  sources: [], limitations: [], disruptions: [], statuses: [], routes: [{ id: 'r1', shortName: 'Green', name: 'Green Line', agency: 'CDA', color: '#008573', sourceId: 'test', coverage: 'stops-and-shape' }],
  stops: [{ id: 'a', name: 'First stop', coordinate: [73, 33.7] }, { id: 'b', name: 'Middle stop', coordinate: [73.01, 33.7] }, { id: 'c', name: 'Last stop', coordinate: [73.02, 33.7] }],
  patterns: [{ id: 'p1', routeId: 'r1', directionId: '0', headsign: 'Last stop', stopIds: ['a', 'b', 'c'], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.02, 33.7]] }, geometryQuality: 'provided-shape' }] };
function fixtures(patch: Partial<AgentProposal> = {}) {
  const proposal: AgentProposal = { kind: 'transit', transitScope: 'route', mapping: 'transit', draft: {}, action: 'disruption', impact: 'unknown', index: 0,
    version: 'proposal-version', state: 'pending', locationKey: 'transit:r1:all:all', targetId: 'notice-fixture', targetRevision: null, issues: [],
    transitDraft: { routeId: 'r1', title: 'Green service suspension', description: 'Original source report', startsAt: at, endsAt: '2027-01-15T14:00:00Z', status: 'published' }, ...patch };
  const result: AgentResult = { noticeId: notice().id, noticeRevision: 1, state: 'review', extraction: extraction(), proposals: [proposal], issues: [], closureIds: [],
    model: 'fixture', attempts: 1, claimId: 'test', leaseUntil: 0, retryAt: 0, startedAt: at };
  const onDecision = vi.fn(), onClose = vi.fn(), onPreview = vi.fn();
  return { proposal, result, notice: notice(), onDecision, onClose, onPreview };
}
beforeEach(() => { mocks.uid = 'admin'; mocks.api.mockReset(); mocks.api.mockResolvedValue(network); mocks.send.mockReset(); setLanguage('en'); });
afterEach(() => { cleanup(); setLanguage('en'); });
async function ready() { await waitFor(() => expect(screen.queryByText('Loading bus lines…')).toBeNull()); }
function confirm() { fireEvent.click(screen.getByRole('checkbox', { name: 'I confirmed the line, direction and affected stops against the source.' })); }
it('shows original evidence, explicit scope and submits one service decision without road geometry', async () => {
  const props = fixtures(); let resolve!: (value: AgentProposalDecision) => void;
  mocks.send.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<TransitProposalEditor {...props} />); await ready();
  fireEvent.click(screen.getByText('Source evidence')); expect(screen.getAllByText(props.notice.text)).toHaveLength(2);
  expect((screen.getByLabelText('Suspension scope') as HTMLSelectElement).value).toBe('all');
  confirm(); const form = screen.getByRole('button', { name: 'Approve suspension' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/review', expect.objectContaining({ confirmTransitScope: true,
    transitDraft: expect.objectContaining({ routeId: 'r1', startsAt: new Date(at).toISOString(), status: 'published' }) }));
  expect(mocks.send.mock.calls[0][1].draft).toBeUndefined();
  await act(async () => { resolve({ result: props.result, proposal: { ...props.proposal, state: 'approved' } }); });
  expect(props.onDecision).toHaveBeenCalledTimes(1);
});
it('keeps ambiguous scope unselected and lets an administrator choose ordered stops', async () => {
  const props = fixtures({ mapping: 'unresolved', transitScope: 'unknown' });
  mocks.send.mockResolvedValue({ result: props.result, proposal: props.proposal });
  render(<TransitProposalEditor {...props} />); await ready();
  expect((screen.getByLabelText('Suspension scope') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Suspension scope'), { target: { value: 'segment' } });
  fireEvent.change(screen.getByLabelText('From stop'), { target: { value: 'a' } });
  fireEvent.change(screen.getByLabelText('To stop'), { target: { value: 'c' } });
  confirm(); fireEvent.submit(screen.getByRole('button', { name: 'Approve suspension' }).closest('form')!);
  await waitFor(() => expect(mocks.send).toHaveBeenCalled());
  expect(mocks.send.mock.calls[0][1].transitDraft).toMatchObject({ directionId: '0', fromStopId: 'a', toStopId: 'c' });
});
it('blocks invalid ordered stops and missing scope instead of silently suspending an entire line', async () => {
  render(<TransitProposalEditor {...fixtures({ mapping: 'unresolved', transitScope: 'unknown' })} />); await ready();
  confirm(); fireEvent.submit(screen.getByRole('button', { name: 'Approve suspension' }).closest('form')!);
  expect(screen.getByRole('alert').textContent).toBe('Choose scope'); expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Suspension scope'), { target: { value: 'segment' } });
  fireEvent.change(screen.getByLabelText('From stop'), { target: { value: 'c' } });
  confirm(); fireEvent.submit(screen.getByRole('button', { name: 'Approve suspension' }).closest('form')!);
  expect(screen.getByRole('alert').textContent).toBe('Choose both ordered stops.'); expect(mocks.send).not.toHaveBeenCalled();
});
it('allows rejecting an unplaced report when transit data is unavailable', async () => {
  const props = fixtures(); mocks.api.mockRejectedValue(new Error('source unavailable')); mocks.send.mockResolvedValue({ result: props.result, proposal: props.proposal });
  render(<TransitProposalEditor {...props} />); await ready();
  expect((screen.getByRole('button', { name: 'Approve suspension' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reject proposal' }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('/agent/notices/fixture-notice/review', { noticeRevision: 1, index: 0, version: 'proposal-version', decision: 'reject' }));
});
it('ignores an older StrictMode network result even if the adapter ignores cancellation', async () => {
  const pending: ((value: TransitNetwork) => void)[] = [];
  mocks.api.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
  render(<StrictMode><TransitProposalEditor {...fixtures()} /></StrictMode>);
  expect(pending).toHaveLength(2);
  await act(async () => pending[1](network));
  await act(async () => pending[0]({ ...network, routes: [{ ...network.routes[0], name: 'Stale hidden service' }] }));
  expect(screen.queryByText(/Stale hidden service/)).toBeNull(); expect(screen.getByRole('option', { name: 'Green · Green Line' })).toBeTruthy();
});
it('does not deliver an approval result into a closed or changed-account editor', async () => {
  const props = fixtures(); let resolve!: (value: AgentProposalDecision) => void;
  mocks.send.mockReturnValue(new Promise(done => { resolve = done; }));
  const rendered = render(<TransitProposalEditor {...props} />); await ready(); confirm();
  fireEvent.submit(screen.getByRole('button', { name: 'Approve suspension' }).closest('form')!);
  rendered.unmount(); mocks.uid = 'different-user';
  await act(async () => resolve({ result: props.result, proposal: props.proposal })); expect(props.onDecision).not.toHaveBeenCalled();
});
it('uses bilingual labels and preserves a separate explicit preview action', async () => {
  setLanguage('ur'); const props = fixtures(); render(<TransitProposalEditor {...props} />);
  await waitFor(() => expect(screen.queryByText('بس لائنیں لوڈ ہو رہی ہیں…')).toBeNull());
  expect(screen.getByRole('heading', { name: 'بس سروس کا جائزہ' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'بس لائن نقشے پر دیکھیں' })); expect(props.onPreview).toHaveBeenCalledWith('r1', undefined, undefined);
});
