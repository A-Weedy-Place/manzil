import { describe, expect, it, vi } from 'vitest';
import { downloadPublicImage, MAX_IMAGE_BYTES } from '../server/source-media';

const url = 'https://pbs.twimg.com/media/synthetic.png';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const response = (bytes: BodyInit = png, headers: HeadersInit = { 'Content-Type': 'image/png' }, status = 200) => new Response(bytes, { headers, status });
const fetcher = (handler: (...args: Parameters<typeof fetch>) => Response | Promise<Response>) => vi.fn(handler) as unknown as typeof fetch;

describe('bounded public source images', () => {
  it('downloads matching raster signatures and hashes bytes without credentials or redirects', async () => {
    const mock = fetcher((_url, init) => {
      expect(init).toMatchObject({ redirect: 'manual', headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).not.toHaveProperty('Cookie');
      return response();
    });
    const result = await downloadPublicImage(url, { fetcher: mock });
    expect(result).toMatchObject({ ok: true, extension: 'png', mimeType: 'image/png', httpStatus: 200 });
    if (result.ok) { expect(result.bytes).toEqual(png); expect(result.sha256).toMatch(/^[a-f0-9]{64}$/); }
  });
  it('refuses foreign hosts, credentials and non-media paths before fetching', async () => {
    const mock = fetcher(() => response());
    for (const value of ['https://localhost/media/test.png', 'https://pbs.twimg.com.evil.test/media/a.png', 'https://user@pbs.twimg.com/media/a.png', 'http://pbs.twimg.com/media/a.png', 'https://pbs.twimg.com/profile_images/a.png']) {
      expect(await downloadPublicImage(value, { fetcher: mock })).toMatchObject({ ok: false, failure: 'invalid_url' });
    }
    expect(mock).not.toHaveBeenCalled();
  });
  it.each([302, 401, 403, 429])('stops a batch after HTTP %s without following redirects', async status => {
    const mock = fetcher(() => response('Rejected', { Location: 'https://other.test' }, status));
    expect(await downloadPublicImage(url, { fetcher: mock })).toEqual({ ok: false, failure: 'http_status', httpStatus: status, stop: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('rejects HTML, SVG, mismatched signatures and empty image bodies', async () => {
    for (const item of [response('<h1>Sign in</h1>', { 'Content-Type': 'text/html' }), response('<svg/>', { 'Content-Type': 'image/svg+xml' })]) {
      expect(await downloadPublicImage(url, { fetcher: fetcher(() => item) })).toMatchObject({ failure: 'content_type' });
    }
    for (const item of [response('<h1>Not a PNG</h1>'), response('')]) {
      expect(await downloadPublicImage(url, { fetcher: fetcher(() => item) })).toMatchObject({ failure: 'invalid_image' });
    }
  });
  it('enforces declared and streamed byte limits', async () => {
    for (const item of [response(png, { 'Content-Type': 'image/png', 'Content-Length': String(MAX_IMAGE_BYTES + 1) }), response(new Uint8Array(MAX_IMAGE_BYTES + 1))]) {
      expect(await downloadPublicImage(url, { fetcher: fetcher(() => item) })).toMatchObject({ failure: 'body_too_large' });
    }
  });
  it('reports network/stream failures without leaking exception details', async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error('private fixture')); } });
    for (const mock of [fetcher(() => Promise.reject(new Error('private fixture'))), fetcher(() => response(stream))]) {
      const result = await downloadPublicImage(url, { fetcher: mock });
      expect(result).toMatchObject({ ok: false, failure: 'network' });
      expect(JSON.stringify(result)).not.toContain('private');
    }
  });
  it('does not request an image after the batch deadline has expired', async () => {
    const controller = new AbortController(); controller.abort();
    const mock = fetcher(() => response());
    expect(await downloadPublicImage(url, { fetcher: mock, signal: controller.signal })).toMatchObject({ failure: 'timeout', stop: true });
    expect(mock).not.toHaveBeenCalled();
  });
});
