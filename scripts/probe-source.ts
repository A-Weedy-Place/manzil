import { collectPublicPosts } from '../server/source.js';
import { downloadPublicImage, MAX_PROBE_IMAGES } from '../server/source-media.js';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// No application bootstrap, database, credentials, model call or source-setting change.
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--download-images')) throw new Error('Usage: npm run source:probe -- [--download-images]');
const started = Date.now();
const result = await collectPublicPosts();
const report = { checkedAt: new Date().toISOString(), elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
  state: result.state, coverage: 'partial', observedArticles: result.observedCount, posts: result.posts.map(post => ({
    sourceId: post.sourceId, url: post.url, publishedAt: post.publishedAt, sourceTimestamp: post.sourceTimestamp,
    textCharacters: post.text.length, mediaCount: post.mediaUrls.length, contentState: post.contentState,
  })), diagnostics: result.diagnostics, message: result.message, applicationDataWritten: false };
const images: { url: string; sourceIds: string[]; kind: 'photo' | 'video_thumbnail'; state: 'downloaded' | 'failed' | 'skipped'; file?: string; bytes?: number; sha256?: string; mimeType?: string; httpStatus?: number | null; failure?: string }[] = [];
let downloadDirectory: string | null = null;
if (args.includes('--download-images')) {
  const urls = [...new Set(result.posts.flatMap(post => post.mediaUrls.slice(0, 4)))];
  if (urls.length) {
    const root = resolve('data/source-probes');
    await mkdir(root, { recursive: true });
    downloadDirectory = await mkdtemp(join(root, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));
    const signal = AbortSignal.timeout(45_000); let stopped = false;
    for (const [index, url] of urls.entries()) {
      const sourceIds = result.posts.filter(post => post.mediaUrls.includes(url)).map(post => post.sourceId);
      const evidence = { url, sourceIds, kind: new URL(url).pathname.startsWith('/media/') ? 'photo' as const : 'video_thumbnail' as const };
      if (stopped || signal.aborted || index >= MAX_PROBE_IMAGES) {
        images.push({ ...evidence, state: 'skipped', failure: 'batch_stopped_or_limit' }); continue;
      }
      const image = await downloadPublicImage(url, { signal });
      if (!image.ok) {
        images.push({ ...evidence, state: 'failed', httpStatus: image.httpStatus, failure: image.failure });
        stopped = image.stop; continue;
      }
      const file = `${index + 1}-${image.sha256}.${image.extension}`;
      await writeFile(join(downloadDirectory, file), image.bytes, { flag: 'wx' });
      images.push({ ...evidence, state: 'downloaded', file, bytes: image.bytes.length, sha256: image.sha256, mimeType: image.mimeType, httpStatus: image.httpStatus });
    }
    await writeFile(join(downloadDirectory, 'manifest.json'), JSON.stringify({ ...report, images, downloadsFinishedAt: new Date().toISOString(), relevance: 'Not classified; review images with their linked source posts.' }, null, 2), { flag: 'wx' });
  }
}
console.log(JSON.stringify({ ...report, totalElapsedSeconds: Math.round((Date.now() - started) / 100) / 10, ...(args.includes('--download-images') ? { downloadDirectory, images, localFilesWritten: downloadDirectory !== null,
  relevance: 'Not classified; review images with their linked source posts.' } : {}) }, null, 2));
if (result.state === 'error' || result.state === 'blocked' || !result.posts.length) process.exitCode = 2;
if (images.some(image => image.state !== 'downloaded')) process.exitCode = 2;
