import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { cloudAgentImages } from '../server/agent-images';
import { mediaMetaKey } from '../server/source-archive';
import { notice } from './agent-fixtures';
const fake = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@google-cloud/storage', () => ({ Storage: class { bucket() { return { file: () => ({ createReadStream: fake.read }) }; } } }));
const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); fake.read.mockReset(); });
const url = 'https://pbs.twimg.com/media/fixture.png', bytes = Buffer.from('archived raster fixture');
const record = () => ({ state: 'saved', bucket: 'private-source', object: 'source-media/2026-10-17/fixture.png', bytes: bytes.length,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(), mimeType: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), kind: 'photo' });
const setup = (patch = {}) => { const store = new Store(':memory:'); stores.push(store); store.setMeta(mediaMetaKey(url), { ...record(), ...patch });
  return { store, read: cloudAgentImages(store, 'offline-fixture', 'private-source') }; };
describe('private archived Gemini image evidence', () => {
  it('reads only the recorded object, verifies byte count/hash and labels thumbnails', async () => {
    fake.read.mockImplementation(() => Readable.from([bytes])); const { read } = setup({ kind: 'video_thumbnail' });
    expect(await read(notice({ mediaUrls: [url] }))).toEqual([{ bytes, mimeType: 'image/png', kind: 'video_thumbnail' }]);
  });
  it.each([{ bucket: 'foreign' }, { expiresAt: 'invalid' }, { expiresAt: '2020-01-01T00:00:00Z' }, { bytes: 3_000_001 }, { object: 'other/private.png' }, { mimeType: 'image/svg+xml' }])(
    'skips unsupported, expired or oversized records before a network read: %j', async patch => {
      const { read } = setup(patch); expect(await read(notice({ mediaUrls: [url] }))).toEqual([]); expect(fake.read).not.toHaveBeenCalled();
    });
  it('omits corrupt/truncated images without losing text evidence', async () => {
    fake.read.mockImplementation(() => Readable.from([Buffer.from('corrupt bytes')])); const { read } = setup();
    expect(await read(notice({ mediaUrls: [url] }))).toEqual([]);
  });
});
