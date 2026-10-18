import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../server/store';
import { SourceService, canonicalPostUrl, eligiblePost, nextSourceCheck, type PublicPost } from '../server/source';

const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach(store => store.close()));
const store = () => { const value = new Store(':memory:'); stores.push(value); return value; };
const post = (changes: Partial<PublicPost> = {}): PublicPost => ({ sourceId: '123456789',
  url: 'https://x.com/shaheryarhassan/status/123456789', text: 'Public traffic announcement',
  publishedAt: new Date().toISOString(), mediaUrls: [], ...changes });

describe('bounded public source intake', () => {
  it('aligns deadlines with cron slots so variable dispatch delay does not skip the next tick', () => {
    const slot = Date.parse('2026-10-17T15:00:00Z');
    expect(nextSourceCheck(slot + 33_000)).toBe(slot + 300_000);
    expect(nextSourceCheck(slot + 1_000)).toBe(slot + 300_000);
    expect(nextSourceCheck(slot - 1)).toBe(slot);
    expect(nextSourceCheck(slot)).toBe(slot + 300_000);
  });
  it('uses five-minute deadlines and keeps its lease through media persistence', async () => {
    const db = store(), before = Date.now();
    const archive = async () => {
      expect(db.acquireSourceLease(Date.now())).toBe(false);
      expect(db.meta<number>('sourceLeaseUntil')).toBeGreaterThan(before + 150_000);
      return { saved: 1, cached: 0, failed: 0, skipped: 0 };
    };
    const service = new SourceService(db, async () => ({ state: 'partial', posts: [post()], observedCount: 1, message: 'Fixture' }), archive);
    await service.settings(true); await service.check();
    const status = db.sourceStatus();
    expect(status.intervalMinutes).toBe(5);
    expect(Date.parse(status.nextCheckAt!) % 300_000).toBe(0);
    expect(Date.parse(status.nextCheckAt!) - Date.parse(status.lastAttemptAt!)).toBeGreaterThan(0);
    expect(Date.parse(status.nextCheckAt!) - Date.parse(status.lastAttemptAt!)).toBeLessThanOrEqual(300_000);
    expect(db.meta('sourceLastRun')).toMatchObject({ accepted: 1, changed: 1, media: { saved: 1 } });
    expect(db.acquireSourceLease(Date.now())).toBe(true);
    expect(await service.due(Date.parse(status.nextCheckAt!) - 1)).toBe(false);
    expect(await service.due(Date.parse(status.nextCheckAt!))).toBe(true);
  });
  it('only accepts canonical posts by the configured author', async () => {
    expect(canonicalPostUrl('https://twitter.com/shaheryarhassan/status/123456789?s=20')).toEqual({ sourceId: '123456789', url: post().url });
    expect(canonicalPostUrl('https://x.com/other/status/123456789')).toBeNull();
    expect(canonicalPostUrl('https://x.com.evil.test/shaheryarhassan/status/123456789')).toBeNull();
  });
  it('accepts current evidence and keeps bounded older dated announcements for agent review', async () => {
    const now = Date.now();
    expect(eligiblePost(post(), now)).toBe(true);
    expect(eligiblePost(post({ publishedAt: new Date(now - 3 * 86400_000).toISOString() }), now)).toBe(false);
    expect(eligiblePost(post({ text: 'Road closure tomorrow from 5 pm', publishedAt: new Date(now - 2 * 86400_000).toISOString() }), now)).toBe(true);
    expect(eligiblePost(post({ text: 'Closure tomorrow', publishedAt: new Date(now - 8 * 86400_000).toISOString() }), now)).toBe(false);
    expect(eligiblePost(post({ publishedAt: '' }), now)).toBe(false);
  });
  it('deduplicates, preserves edited revisions, and atomically supersedes old agent jobs', async () => {
    const db = store(); let text = 'First public report';
    const service = new SourceService(db, async () => ({ state: 'partial', posts: [post({ text, publishedAt: '2026-10-14T10:00:00Z' })], observedCount: 1, message: 'Partial public fixture' }));
    // Use a dynamic timestamp to keep this test meaningful on later dates as well.
    const originalTime = new Date().toISOString();
    const fresh = new SourceService(db, async () => ({ state: 'partial', posts: [post({ text, publishedAt: originalTime })], observedCount: 1, message: 'Partial public fixture' }));
    await fresh.check(); await fresh.check(); expect(db.listNotices()).toHaveLength(1); expect(db.pendingAgentCount()).toBe(1);
    const first = db.listNotices()[0]; text = 'Edited public report'; await fresh.check();
    const edited = db.listNotices()[0]; expect(edited.id).toBe(first.id); expect(edited.revision).toBe(2); expect(edited.publishedAt).toBe(originalTime);
    expect(db.pendingAgentCount()).toBe(1); expect(db.db.prepare('SELECT COUNT(*) AS n FROM notice_versions').get()?.n).toBe(2);
    expect(db.sourceStatus().coverage).toBe('partial'); expect(db.sourceStatus().nextCheckAt).not.toBeNull();
    expect((await service.due())).toBe(false);
  });
  it('does not pretend login walls collected data and respects durable leases', async () => {
    const db = store(); let calls = 0;
    const service = new SourceService(db, async () => { calls++; return { state: 'blocked', posts: [], observedCount: 0, message: 'Sign-in wall, no bypass.' }; });
    expect(db.acquireSourceLease(Date.now())).toBe(true);
    await service.check(); expect(calls).toBe(0); db.releaseSourceLease();
    const status = await service.check(); expect(status.state).toBe('blocked'); expect(status.lastSuccessAt).toBeNull(); expect(status.noticesCollected).toBe(0);
    expect((await service.settings(false)).state).toBe('disabled'); expect((await service.due())).toBe(false);
  });
  it('preserves empty original text and media references for a media-only public notice', async () => {
    const db = store();
    const mediaUrl = 'https://pbs.twimg.com/media/fixture-image.jpg';
    const service = new SourceService(db, async () => ({ state: 'partial', observedCount: 1, message: 'Visible media-only post.',
      posts: [post({ text: '', mediaUrls: [mediaUrl], contentState: 'media_only' })] }));
    await service.check();
    expect(db.listNotices()[0]).toMatchObject({ text: '', mediaUrls: [mediaUrl], contentState: 'media_only', status: 'pending_agent' });
  });
  it('coalesces simultaneous checks and recovers a missed restart deadline', async () => {
    const db = store(); let finish!: () => void;
    const wait = new Promise<void>(resolve => { finish = resolve; }); let calls = 0;
    const service = new SourceService(db, async () => { calls++; await wait; return { posts: [], state: 'partial', observedCount: 0, message: 'No visible posts.' }; });
    db.updateSourceStatus({ nextCheckAt: '2000-01-01T00:00:00Z' }); expect((await service.due())).toBe(true);
    const a = service.check(), b = service.check(); finish(); await Promise.all([a, b]); expect(calls).toBe(1); expect((await service.due())).toBe(false);
    db.updateSourceStatus({ state: 'checking', nextCheckAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    db.setMeta('sourceLeaseUntil', Date.now() - 1); expect((await service.due())).toBe(true);
  });
  it('retains an established publication time across edit-only observations and deduplicates repeated edits', async () => {
    const db = store(), publishedAt = new Date(Date.now() - 60_000).toISOString(), editedAt = new Date().toISOString();
    let current = post({ publishedAt });
    const service = new SourceService(db, async () => ({ state: 'partial', observedCount: 1, posts: [current], message: 'Synthetic edit evidence' }));
    await service.check();
    current = post({ text: 'Edited synthetic advisory', publishedAt: null, sourceTimestamp: { at: editedAt, kind: 'edited' } });
    await service.check(); await service.check();
    expect(db.listNotices()[0]).toMatchObject({ publishedAt, sourceTimestamp: { at: editedAt, kind: 'edited' }, revision: 2 });
    expect(db.pendingAgentCount()).toBe(1);
  });
  it('stores edit-only evidence with unknown original publication, rather than using collection time', async () => {
    const db = store(), editedAt = new Date().toISOString();
    const service = new SourceService(db, async () => ({ state: 'partial', observedCount: 1, posts: [post({ publishedAt: null, sourceTimestamp: { at: editedAt, kind: 'edited' } })], message: 'Synthetic edit-only evidence' }));
    await service.check(); await service.check();
    expect(db.listNotices()[0]).toMatchObject({ publishedAt: null, sourceTimestamp: { at: editedAt, kind: 'edited' }, revision: 1 });
  });
  it('does not call an old pinned-only or ambiguous timestamp result a successful check', async () => {
    const db = store();
    const service = new SourceService(db, async () => ({ state: 'partial', observedCount: 2, posts: [
      post({ publishedAt: '2023-09-24T15:29:02Z', pinned: true }),
      post({ publishedAt: null, sourceTimestamp: { at: new Date().toISOString(), kind: 'displayed' } }),
    ], message: 'Synthetic unusable evidence' }));
    await service.check();
    expect(db.sourceStatus().lastSuccessAt).toBeNull(); expect(db.listNotices()).toEqual([]);
  });
});
