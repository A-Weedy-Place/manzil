import { createHash } from 'node:crypto';
import { sourceMediaUrl } from './source-html.js';

export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_PROBE_IMAGES = 8;
type ImageFailure = 'invalid_url' | 'http_status' | 'content_type' | 'missing_body' | 'body_too_large' | 'invalid_image' | 'timeout' | 'network';
export type ImageResult = { ok: true; bytes: Buffer; extension: string; mimeType: string; sha256: string; httpStatus: number } |
  { ok: false; failure: ImageFailure; httpStatus: number | null; stop: boolean };

/** Small, passive raster downloads only. No redirects, cookies, credentials or image decoding. */
export async function downloadPublicImage(url: string, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<ImageResult> {
  if (!sourceMediaUrl(url)) return { ok: false, failure: 'invalid_url', httpStatus: null, stop: false };
  const signal = AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]);
  let httpStatus: number | null = null;
  const fail = (failure: ImageFailure, stop = false): ImageResult => ({ ok: false, failure, httpStatus, stop });
  try {
    signal.throwIfAborted();
    const response = await (options.fetcher ?? fetch)(url, { redirect: 'manual', signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' } });
    httpStatus = response.status;
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    let failure: ImageFailure | null = null;
    if (!response.ok) failure = 'http_status';
    else if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) failure = 'content_type';
    else if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) failure = 'body_too_large';
    if (failure || !response.body) {
      await response.body?.cancel();
      return fail(failure ?? 'missing_body', [401, 403, 429].includes(response.status) || response.status >= 300 && response.status < 400);
    }
    const reader = response.body.getReader(), chunks: Buffer[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_IMAGE_BYTES) return fail('body_too_large');
        chunks.push(Buffer.from(part.value));
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    const signature = bytes.subarray(0, 12);
    const extension = mimeType === 'image/jpeg' && signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpg' :
      mimeType === 'image/png' && signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png' :
      mimeType === 'image/webp' && signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP' ? 'webp' :
      mimeType === 'image/gif' && ['GIF87a', 'GIF89a'].includes(signature.toString('ascii', 0, 6)) ? 'gif' : null;
    if (!extension) return fail('invalid_image');
    return { ok: true, bytes, extension, mimeType, sha256: createHash('sha256').update(bytes).digest('hex'), httpStatus: response.status };
  } catch (error) {
    return fail(signal.aborted || error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network', options.signal?.aborted);
  }
}
