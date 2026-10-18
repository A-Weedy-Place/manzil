import { createHash } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import type { Repository } from './repository.js';
import { sourceMediaUrl, type PublicPost } from './source-html.js';
import { downloadPublicImage, MAX_PROBE_IMAGES, type ImageResult } from './source-media.js';

export interface MediaSummary { saved: number; cached: number; failed: number; skipped: number }
export interface MediaArchiveRecord {
  url: string; sourceIds: string[]; state: 'saved' | 'failed'; kind: 'photo' | 'video_thumbnail';
  attemptedAt: string; retryAt?: string; failure?: string; bucket?: string; object?: string;
  sha256?: string; mimeType?: string; bytes?: number; expiresAt?: string;
}
type Image = Extract<ImageResult, { ok: true }>;
export type MediaWriter = (object: string, image: Image) => Promise<void>;
export type MediaArchiver = (posts: PublicPost[]) => Promise<MediaSummary>;
export const mediaMetaKey = (url: string) => `sourceMedia:${createHash('sha256').update(url).digest('hex')}`;

/** Separate evidence metadata: media availability never rewrites a notice revision/status. */
export class SourceMediaArchive {
  constructor(private store: Repository, private bucket: string, private write: MediaWriter,
    private download = downloadPublicImage, private clock = Date.now) {}
  async archive(posts: PublicPost[]): Promise<MediaSummary> {
    const summary: MediaSummary = { saved: 0, cached: 0, failed: 0, skipped: 0 };
    const urls = [...new Set(posts.flatMap(post => post.mediaUrls.filter(sourceMediaUrl).slice(0, 4)))];
    const signal = AbortSignal.timeout(45_000); let attempted = 0, stopped = false;
    for (const url of urls) {
      if (stopped || signal.aborted || attempted >= MAX_PROBE_IMAGES) { summary.skipped++; continue; }
      const now = this.clock(), key = mediaMetaKey(url), previous = await this.store.meta<MediaArchiveRecord>(key);
      if (previous?.state === 'saved' && Date.parse(previous.expiresAt ?? '') > now) { summary.cached++; continue; }
      if (previous?.state === 'failed' && Date.parse(previous.retryAt ?? '') > now) { summary.skipped++; continue; }
      const base = { url, sourceIds: posts.filter(post => post.mediaUrls.includes(url)).map(post => post.sourceId),
        kind: new URL(url).pathname.startsWith('/media/') ? 'photo' as const : 'video_thumbnail' as const, attemptedAt: new Date(now).toISOString() };
      attempted++;
      const image = await this.download(url, { signal });
      let failure: string;
      if (image.ok) {
        const object = `source-media/${new Date(now).toISOString().slice(0, 10)}/${key.slice(12)}/${image.sha256}.${image.extension}`;
        try {
          if (signal.aborted) throw new Error('Batch expired.');
          await this.write(object, image);
          await this.store.setMeta(key, { ...base, state: 'saved', bucket: this.bucket, object, sha256: image.sha256,
            mimeType: image.mimeType, bytes: image.bytes.length, expiresAt: new Date(now + 7 * 86400_000).toISOString() } satisfies MediaArchiveRecord);
          summary.saved++; continue;
        } catch { failure = 'storage_write'; }
      } else { failure = image.failure; stopped = image.stop; }
      await this.store.setMeta(key, { ...base, state: 'failed', failure,
        retryAt: new Date(now + 15 * 60_000).toISOString() } satisfies MediaArchiveRecord);
      summary.failed++;
    }
    return summary;
  }
}

export function cloudMediaArchiver(store: Repository, projectId: string, bucket: string): MediaArchiver {
  const storage = new Storage({ projectId, retryOptions: { autoRetry: false } });
  const archive = new SourceMediaArchive(store, bucket, async (object, image) => {
    try {
      await storage.bucket(bucket).file(object).save(image.bytes, { resumable: false, timeout: 10_000,
        preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: image.mimeType, cacheControl: 'private,no-store',
          metadata: { sha256: image.sha256, evidence: 'unclassified-public-source' } } });
    } catch (error) {
      // Retry after a successful upload/failed metadata write can encounter the same immutable object.
      if ((error as { code?: number }).code !== 412) throw error;
    }
  });
  return posts => archive.archive(posts);
}
