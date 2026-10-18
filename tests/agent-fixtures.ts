import type { AgentClaim, AgentExtraction, AgentResult } from '../shared/agent';
import type { SourceNotice } from '../shared/types';
import { drawingToPolygon } from '../server/geometry';

export const now = Date.parse('2026-10-17T12:30:00Z');
export const sourceText = 'Today Park Road in Islamabad is closed from First Road to Second Road from 5 pm to 7 pm.';
export const notice = (patch: Partial<SourceNotice> = {}): SourceNotice => ({ id: 'fixture-notice', source: 'x', sourceId: '123456789',
  url: 'https://x.com/shaheryarhassan/status/123456789', text: sourceText, publishedAt: '2026-10-17T11:00:00Z',
  receivedAt: '2026-10-17T11:01:00Z', revision: 1, status: 'pending_agent', mediaUrls: [], contentHash: 'fixture', ...patch });
export const extraction = (): AgentExtraction => ({ summary: 'Park Road closure announced.', summaryUrdu: 'پارک روڈ کی بندش کا اعلان۔',
  category: 'traffic', irrelevantReason: null, warnings: [], fuel: [], events: [{ action: 'closure', title: 'Park Road closure',
    reason: 'other', impact: 'closed', location: { city: 'Islamabad', road: 'Park Road', from: 'First Road', to: 'Second Road', point: null },
    startsAt: '2026-10-17T17:00:00+05:00', endsAt: '2026-10-17T19:00:00+05:00', timeBasis: 'publication_relative',
    targetIncidentId: null, confidence: .98, quote: sourceText, imageIndex: null, uncertainties: [] }] });
export const location = () => { const drawing = { kind: 'point' as const, coordinates: [[73.03,33.71] as [number,number]], widthMeters: 14 };
  return { key: 'islamabad:parkroad:firstroad:secondroad', drawing, geometry: drawingToPolygon(drawing) }; };
export const claimInput = (notice: SourceNotice, patch: Partial<AgentClaim> = {}): AgentClaim => ({ noticeId: notice.id, revision: notice.revision,
  claimId: 'claim-fixture', now: Date.now(), model: 'gemini-3.1-flash-lite', dailyLimit: 20, budgetMicros: 1_000_000, reservationMicros: 20_000, ...patch });
export const finished = (claim: AgentResult, state: AgentResult['state'] = 'review'): AgentResult => ({ ...claim, state, leaseUntil: 0, finishedAt: new Date().toISOString() });
