import { createHash } from 'node:crypto';
import type { SourceStatus } from '../shared/types.js';
import type { Repository } from './repository.js';
import { SOURCE_INTERVAL_MINUTES } from '../shared/source.js';
import type { MediaArchiver, MediaSummary } from './source-archive.js';
import { canonicalPostUrl, MAX_SOURCE_BYTES, parsePublicPosts, PROFILE_URL, sourceMediaUrl, type PublicPost } from './source-html.js';

export { canonicalPostUrl, parsePublicPosts, PROFILE_URL, type PublicPost } from './source-html.js';
const INTERVAL_MS = SOURCE_INTERVAL_MINUTES * 60_000;
// Follow clock slots: dispatch jitter must not push a due check past the next cron tick.
export const nextSourceCheck = (now: number) => Math.floor(now / INTERVAL_MS) * INTERVAL_MS + INTERVAL_MS;
export interface CollectionResult {
  posts: PublicPost[]; state: 'partial' | 'blocked' | 'error'; message: string;
  observedCount: number;
  diagnostics?: SourceRequestDiagnostic[];
}
export interface SourceRequestDiagnostic {
  stage: 'profile' | 'detail'; url: string; elapsedMs: number; httpStatus: number | null;
  failure: 'http_status' | 'content_type' | 'missing_body' | 'body_too_large' | 'request_timeout' | 'collection_timeout' | 'network' | null;
  networkCode?: string;
}
export type Collector = () => Promise<CollectionResult>;
export const contentHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Recent raw evidence only; this is not an assertion that a road is closed. */
export function eligiblePost(post: PublicPost, now: number): boolean {
  const time = Date.parse(post.publishedAt ?? post.sourceTimestamp?.at ?? ''), age = now - time;
  if (post.pinned && !post.publishedAt) return false;
  if (!Number.isFinite(time) || age < -5 * 60_000 || age > 7 * 86400_000) return false;
  if (age <= 86400_000) return true;
  if (!post.publishedAt) return false;
  // Keep visible older announcements with an explicit future-day/date hint for agent review.
  // Missing dates are never replaced with the collection time.
  return /tomorrow|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|کل|آئندہ|بروز/i.test(post.text);
}

class SourceRequestError extends Error {
  constructor(readonly blocked: boolean, readonly failure: SourceRequestDiagnostic['failure']) { super('Public source request was not usable.'); }
}
// Only emit machine codes, never raw errors, headers, environment values or response bodies.
function networkCode(error: unknown): string | undefined {
  for (let depth = 0; depth < 5 && error && typeof error === 'object'; depth++) {
    const item = error as { code?: unknown; cause?: unknown };
    if (typeof item.code === 'string' && /^(?:E[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+|ERR_TLS_[A-Z0-9_]+|CERT_[A-Z0-9_]+|DEPTH_ZERO_SELF_SIGNED_CERT)$/.test(item.code)) return item.code;
    error = item.cause;
  }
}
async function publicHtml(url: string, fetcher: typeof fetch, signal: AbortSignal, diagnostics: SourceRequestDiagnostic[]): Promise<string> {
  const started = Date.now(), requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const diagnostic: SourceRequestDiagnostic = { stage: url === PROFILE_URL ? 'profile' : 'detail', url, elapsedMs: 0, httpStatus: null, failure: null };
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: requestSignal,
      headers: { Accept: 'text/html,application/xhtml+xml' } });
    diagnostic.httpStatus = response.status;
    const blocked = [401, 403, 429].includes(response.status) || response.status >= 300 && response.status < 400;
    let failure: SourceRequestDiagnostic['failure'] = null;
    if (!response.ok) failure = 'http_status';
    else if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) failure = 'content_type';
    else if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) failure = 'body_too_large';
    if (failure || !response.body) {
      await response.body?.cancel(); throw new SourceRequestError(blocked, failure ?? 'missing_body');
    }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, html = '';
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_SOURCE_BYTES) throw new SourceRequestError(false, 'body_too_large');
        html += decoder.decode(part.value, { stream: true });
      }
      return html + decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch (error) {
    diagnostic.failure = error instanceof SourceRequestError ? error.failure : signal.aborted ? 'collection_timeout' : requestSignal.aborted || error instanceof Error && error.name === 'TimeoutError' ? 'request_timeout' : 'network';
    const code = networkCode(error); if (code) diagnostic.networkCode = code;
    throw error;
  } finally { diagnostic.elapsedMs = Date.now() - started; diagnostics.push(diagnostic); }
}

/** Bounded, cookie-free public HTML. No browser, script execution or alternate-source fallback. */
export async function collectPublicPosts(options: { fetcher?: typeof fetch; now?: number } = {}): Promise<CollectionResult> {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now();
  const deadline = AbortSignal.timeout(35_000);
  const diagnostics: SourceRequestDiagnostic[] = [];
  let observedCount = 0, incomplete = 0;
  const posts = new Map<string, PublicPost>();
  try {
    const profile = parsePublicPosts(await publicHtml(PROFILE_URL, fetcher, deadline, diagnostics));
    observedCount = profile.observedCount;
    if (!profile.posts.length) return { posts: [], observedCount, diagnostics, state: profile.blocked ? 'blocked' : 'partial',
      message: 'The public page exposed no usable timestamped posts. Access or markup may have changed; coverage is unknown. Manual import remains available.' };
    const candidates = profile.posts.filter(post => eligiblePost(post, now)).sort((a, b) =>
      Date.parse(b.publishedAt ?? b.sourceTimestamp!.at) - Date.parse(a.publishedAt ?? a.sourceTimestamp!.at));
    for (const post of candidates.slice(0, 4)) {
      let selected = post;
      try {
        const detail = parsePublicPosts(await publicHtml(post.url, fetcher, deadline, diagnostics), post.sourceId).posts[0];
        if (detail) selected = detail; else incomplete++;
      } catch (error) {
        incomplete++;
        if (error instanceof SourceRequestError && error.blocked) {
          if (post.publishedAt) posts.set(post.sourceId, post);
          return { posts: [...posts.values()], observedCount, diagnostics, state: posts.size ? 'partial' : 'blocked',
            message: 'A public detail request was blocked or redirected. Further requests stopped; no bypass was attempted. Coverage remains partial.' };
        }
      }
      // Profile-only relative/displayed times can be edit times. Never label them as publication.
      // Keep known edited times separately, with publishedAt null, for explicit later review.
      if ((selected.publishedAt || selected.sourceTimestamp?.kind === 'edited') && eligiblePost(selected, now)) posts.set(selected.sourceId, selected);
      else incomplete++;
      if (deadline.aborted) break;
    }
    return { posts: [...posts.values()], observedCount, diagnostics, state: 'partial',
      message: `Read bounded signed-out public HTML and at most four linked posts. ${incomplete} detail/time checks were incomplete. Coverage is partial: bursts, edits, deletions and media may be missed; unknown publication times require review. Raw notices await the agent.` };
  } catch (error) {
    return { posts: [...posts.values()], observedCount, diagnostics, state: posts.size ? 'partial' : error instanceof SourceRequestError && error.blocked ? 'blocked' : 'error',
      message: 'The bounded public HTML check failed or was blocked. Existing data is retained; no alternate source or access-control bypass was attempted. Manual import remains available.' };
  }
}

export class SourceService {
  private running: Promise<SourceStatus> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private store: Repository, private collector: Collector = collectPublicPosts, private archive?: MediaArchiver) {}
  async settings(enabled: boolean): Promise<SourceStatus> {
    return this.store.updateSourceStatus({ enabled, intervalMinutes: SOURCE_INTERVAL_MINUTES,
      state: enabled ? (this.running ? 'checking' : 'idle') : 'disabled',
      nextCheckAt: enabled ? new Date().toISOString() : null,
      message: enabled ? 'Automatic signed-out public checks enabled. Coverage remains partial.' : 'Automatic source checks disabled. Manual import is available.' });
  }
  async due(now = Date.now()) {
    const status = await this.store.sourceStatus();
    const abandonedCheck = status.state === 'checking' && ((await this.store.meta<number>('sourceLeaseUntil')) ?? 0) <= now;
    return status.enabled && (abandonedCheck || !status.nextCheckAt || Date.parse(status.nextCheckAt) <= now);
  }
  start() {
    if (this.timer) return;
    // API startup never waits for source I/O. A missed deadline is caught up once after restart.
    this.timer = setInterval(() => { void this.due().then(due => due ? this.check() : undefined).catch(() => {}); }, 30_000);
    this.timer.unref();
    setImmediate(() => { void this.due().then(due => due ? this.check() : undefined).catch(() => {}); });
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  check(): Promise<SourceStatus> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run(): Promise<SourceStatus> {
    const now = Date.now();
    if (!await this.store.acquireSourceLease(now)) return this.store.sourceStatus();
    await this.store.updateSourceStatus({ lastAttemptAt: new Date(now).toISOString(), state: 'checking', intervalMinutes: SOURCE_INTERVAL_MINUTES,
      nextCheckAt: new Date(nextSourceCheck(now)).toISOString(), message: 'Checking the signed-out public profile. Coverage is partial.' });
    try {
      const result = await this.collector();
      const acceptedPosts: PublicPost[] = [];
      let changed = 0, skipped = 0, accepted = 0;
      for (const post of result.posts) {
        const canonical = canonicalPostUrl(post.url);
        if (!canonical || canonical.sourceId !== post.sourceId || !eligiblePost(post, now) ||
          !post.publishedAt && post.sourceTimestamp?.kind !== 'edited') { skipped++; continue; }
        const input = { source: 'x' as const, ...canonical, text: post.text.slice(0, 20_000), publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
          ...(post.sourceTimestamp ? { sourceTimestamp: post.sourceTimestamp } : {}),
          mediaUrls: post.mediaUrls.filter(sourceMediaUrl).slice(0, 4),
          contentState: post.contentState ?? (!post.text.trim() ? 'media_only' : 'text') };
        accepted++;
        acceptedPosts.push(post);
        if ((await this.store.upsertNotice({ ...input, contentHash: contentHash(input) })).changed) changed++;
      }
      let media: MediaSummary | undefined;
      if (this.archive) media = await this.archive(acceptedPosts);
      await this.store.setMeta('sourceCoverage', { checkedAt: new Date(now).toISOString(), observedCount: result.observedCount,
        latestObservedId: result.posts.map(post => post.sourceId).sort((a, b) => a.length - b.length || a.localeCompare(b)).at(-1) ?? null,
        skipped, changed, completeHistory: false });
      const current = await this.store.sourceStatus();
      const status = await this.store.updateSourceStatus({ state: current.enabled ? result.state : 'disabled',
        lastSuccessAt: accepted ? new Date().toISOString() : current.lastSuccessAt,
        message: `${result.message} ${changed} new or edited notices queued; ${skipped} outside the date/author window skipped.${media ? ` Images: ${media.saved} saved, ${media.cached} cached, ${media.failed} failed, ${media.skipped} skipped.` : ''}` });
      const run = { startedAt: new Date(now).toISOString(), finishedAt: new Date().toISOString(),
        state: status.state, observedCount: result.observedCount, accepted, changed, skipped, coverage: 'partial',
        diagnostics: result.diagnostics ?? [], ...(media ? { media } : {}) };
      await this.store.setMeta('sourceLastRun', run);
      await this.store.addSourceRun(run);
      console.log(JSON.stringify({ event: 'source_collection', ...run }));
      return status;
    } catch {
      return this.store.updateSourceStatus({ state: (await this.store.sourceStatus()).enabled ? 'error' : 'disabled',
        message: 'Source collection failed. Existing data is retained; the next scheduled check will retry. Manual import remains available.' });
    } finally { await this.store.releaseSourceLease(); }
  }
}
