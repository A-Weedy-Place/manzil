// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClosureEditor from '../src/components/ClosureEditor';
import type { AgentProposal } from '../shared/agent';
import { extraction, location, notice } from './agent-fixtures';
import { setLanguage } from '../src/lib/language';
const calls = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/lib/api', () => ({ send: calls.send }));
beforeEach(() => { setLanguage('en'); calls.send.mockReset().mockResolvedValue(location().geometry); });
afterEach(cleanup);
const proposal = (): AgentProposal => ({ index: 0, version: 'fixture', state: 'pending', action: 'closure', impact: 'closed', mapping: 'road',
  locationKey: location().key, issues: [], targetId: 'fixture-target', targetRevision: null,
  draft: { title: 'Prepared road', description: 'Original evidence', reason: 'vip', startsAt: extraction().events[0].startsAt!, endsAt: extraction().events[0].endsAt,
    sourceUrl: notice().url, status: 'draft', geometry: location().geometry, drawing: location().drawing } });
function editor(value = proposal()) {
  const save = vi.fn(async () => {}), reject = vi.fn(async () => {});
  const ui = render(<ClosureEditor closure={null} seed={value.draft} drawing={value.draft.drawing ?? { kind: 'line', coordinates: [], widthMeters: 14 }}
    onDraw={vi.fn()} mode="browse" setMode={vi.fn()} onSave={save} onCancel={vi.fn()} canPublish agentProposal={value} onReject={reject} />);
  return { save, reject, ui };
}
it('prefills the prepared reason, exact PKT times, source, notes and existing map drawing', async () => {
  const { save, ui } = editor();
  expect((screen.getByLabelText('Road / place') as HTMLInputElement).value).toBe('Prepared road');
  expect((screen.getByLabelText('Reason') as HTMLSelectElement).value).toBe('vip');
  expect((screen.getByLabelText('Starts · Pakistan time') as HTMLInputElement).value).toBe('2026-10-17T17:00');
  expect((screen.getByLabelText('Ends · Pakistan time') as HTMLInputElement).value).toBe('2026-10-17T19:00');
  expect((screen.getByLabelText(/Source link/) as HTMLInputElement).value).toBe(notice().url);
  expect(screen.getByRole('button', { name: 'Change road' })).toBeTruthy();
  expect(screen.queryByLabelText('Point 1 latitude')).toBeNull();
  fireEvent.submit(ui.container.querySelector('form')!);
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({ reason: 'vip', startsAt: '2026-10-17T12:00:00.000Z', endsAt: '2026-10-17T14:00:00.000Z', status: 'published', drawing: location().drawing })]);
});
it('leaves unknown start blank and never defaults an agent expiry to one hour from now', async () => {
  const value = proposal(); delete value.draft.startsAt; value.draft.endsAt = null;
  const { save, ui } = editor(value);
  expect((screen.getByLabelText('Starts · Pakistan time') as HTMLInputElement).value).toBe('');
  expect(screen.queryByLabelText('Ends · Pakistan time')).toBeNull();
  fireEvent.submit(ui.container.querySelector('form')!);
  await screen.findByText('Enter the confirmed start time before approving.'); expect(save).not.toHaveBeenCalled();
  fireEvent.input(screen.getByLabelText('Starts · Pakistan time'), { target: { value: '2026-10-17T17:00' } });
  fireEvent.submit(ui.container.querySelector('form')!);
  await screen.findByText('Confirm that this restriction should remain active until cancelled, or set an end time.'); expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('I approve keeping this restriction active until an administrator cancels it.'));
  fireEvent.submit(ui.container.querySelector('form')!);
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
});
it('rejects a draft without publishing or invoking geometry/model services', async () => {
  const { reject, save } = editor(); fireEvent.click(screen.getByRole('button', { name: 'Reject proposal' }));
  await waitFor(() => expect(reject).toHaveBeenCalledOnce()); expect(save).not.toHaveBeenCalled(); expect(calls.send).not.toHaveBeenCalled();
});
