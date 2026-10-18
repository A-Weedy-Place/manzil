import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { SourceMediaArchive, mediaMetaKey, type MediaArchiveRecord } from '../server/source-archive';
import type { PublicPost } from '../server/source-html';
import type { ImageResult } from '../server/source-media';

const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach(store => store.close()));
const store = () => { const db = new Store(':memory:'); stores.push(db); return db; };
const url = 'https://pbs.twimg.com/media/synthetic.png';
const post = (mediaUrls = [url]): PublicPost => ({ sourceId: '123', url: 'https://x.com/shaheryarhassan/status/123', text: 'Synthetic advisory', publishedAt: new Date().toISOString(), mediaUrls });
const image: ImageResult = { ok: true, bytes: Buffer.from('synthetic decoded fixture'), extension: 'png', mimeType: 'image/png', sha256: 'a'.repeat(64), httpStatus: 200 };

describe('durable source media archive', () => {
  it('archives once per URL, links evidence and reuses it across worker instances', async () => {
    const db = store(), write = vi.fn(async () => {}), download = vi.fn(async () => image), now = Date.now();
    const archive = new SourceMediaArchive(db, 'private-bucket', write, download, () => now);
    expect(await archive.archive([post(), { ...post(), sourceId: '124' }])).toEqual({ saved: 1, cached: 0, failed: 0, skipped: 0 });
    expect(await new SourceMediaArchive(db, 'private-bucket', write, download, () => now).archive([post()])).toMatchObject({ cached: 1, saved: 0 });
    expect(download).toHaveBeenCalledTimes(1); expect(write).toHaveBeenCalledTimes(1);
    expect(db.meta<MediaArchiveRecord>(mediaMetaKey(url))).toMatchObject({ state: 'saved', sourceIds: ['123', '124'], bucket: 'private-bucket', kind: 'photo', sha256: image.sha256, expiresAt: new Date(now + 7 * 86400_000).toISOString() });
    expect(db.listNotices()).toEqual([]);
  });
  it('retains failed state and retries only after cooldown without pretending an upload succeeded', async () => {
    const db = store(), write = vi.fn(async (): Promise<void> => { throw new Error('Private error'); }), download = vi.fn(async () => image); let now = Date.now();
    const archive = new SourceMediaArchive(db, 'private-bucket', write, download, () => now);
    expect(await archive.archive([post()])).toMatchObject({ failed: 1, saved: 0 });
    expect(db.meta(mediaMetaKey(url))).toMatchObject({ state: 'failed', failure: 'storage_write' });
    expect(await archive.archive([post()])).toMatchObject({ skipped: 1 });
    expect(download).toHaveBeenCalledTimes(1);
    now += 15 * 60_000; write.mockResolvedValueOnce(undefined);
    expect(await archive.archive([post()])).toMatchObject({ saved: 1 });
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('stops on blocked media and leaves other URLs for later, without writing any image', async () => {
    const db = store(), write = vi.fn(async () => {}), download = vi.fn(async (): Promise<ImageResult> => ({ ok: false, failure: 'http_status', httpStatus: 429, stop: true }));
    const archive = new SourceMediaArchive(db, 'private-bucket', write, download);
    expect(await archive.archive([post([url, `${url}?second`])])).toEqual({ saved: 0, cached: 0, failed: 1, skipped: 1 });
    expect(download).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled();
  });
  it('limits each run to eight new images, rejects foreign URLs and labels video thumbnails', async () => {
    const db = store(), write = vi.fn(async () => {}), download = vi.fn(async () => image);
    const urls = Array.from({ length: 11 }, (_, n) => `https://pbs.twimg.com/amplify_video_thumb/${n}/image.png`);
    const archive = new SourceMediaArchive(db, 'private-bucket', write, download);
    const posts = [post(urls.slice(0, 4)), post(urls.slice(4, 8)), post(urls.slice(8)), post(['bad url', 'https://other.test/private'])];
    expect(await archive.archive(posts)).toEqual({ saved: 8, cached: 0, failed: 0, skipped: 3 });
    expect(db.meta(mediaMetaKey(urls[0]))).toMatchObject({ kind: 'video_thumbnail' });
    expect(download).toHaveBeenCalledTimes(8);
  });
});
