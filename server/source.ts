import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { SourceStatus } from '../shared/types.js';
import type { Repository } from './repository.js';

export const PROFILE_URL = 'https://x.com/shaheryarhassan';
const AUTHOR = 'shaheryarhassan';
const INTERVAL_MS = 15 * 60_000;
export interface PublicPost {
  sourceId: string; url: string; text: string; publishedAt: string; mediaUrls: string[];
  contentState?: 'text' | 'media_only' | 'possibly_truncated';
}
export interface CollectionResult {
  posts: PublicPost[]; state: 'partial' | 'blocked' | 'error'; message: string;
  observedCount: number;
}
export type Collector = () => Promise<CollectionResult>;
export const contentHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function canonicalPostUrl(value: string): { sourceId: string; url: string } | null {
  try {
    const url = new URL(value, PROFILE_URL);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
    if (!match || match[1].toLowerCase() !== AUTHOR) return null;
    return { sourceId: match[2], url: `https://x.com/${AUTHOR}/status/${match[2]}` };
  } catch { return null; }
}

/** Recent raw evidence only; this is not an assertion that a road is closed. */
export function eligiblePost(post: PublicPost, now: number): boolean {
  const time = Date.parse(post.publishedAt), age = now - time;
  if (!Number.isFinite(time) || age < -5 * 60_000 || age > 7 * 86400_000) return false;
  if (age <= 86400_000) return true;
  // Keep visible older announcements with an explicit future-day/date hint for agent review.
  // Missing dates are never replaced with the collection time.
  return /tomorrow|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|کل|آئندہ|بروز/i.test(post.text);
}

export function browserExecutable(): string | undefined {
  const localRoot = resolve(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '.playwright');
  const bundled: string[] = [];
  if (existsSync(localRoot)) {
    for (const entry of readdirSync(localRoot).filter(name => /^chromium(?:_headless_shell)?-\d+$/.test(name)).sort().reverse()) {
      bundled.push(join(localRoot, entry, 'chrome-win64/chrome.exe'), join(localRoot, entry, 'chrome-win/chrome.exe'),
        join(localRoot, entry, 'chrome-linux64/chrome'), join(localRoot, entry, 'chrome-linux/chrome'),
        join(localRoot, entry, 'chrome-headless-shell-win64/headless_shell.exe'));
    }
  }
  const paths = [process.env.BROWSER_EXECUTABLE_PATH, process.env.MANZIL_BROWSER_EXECUTABLE,
    ...bundled,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)']!, 'Microsoft/Edge/Application/msedge.exe'),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', chromium.executablePath()];
  return paths.find((path): path is string => Boolean(path && existsSync(path)));
}

async function visiblePosts(page: Page): Promise<PublicPost[]> {
  const candidates = await page.locator('article').evaluateAll(articles => articles.slice(0, 35).map(article => {
    const time = article.querySelector('time');
    const anchor = time?.closest('a');
    const text = article.querySelector('[data-testid="tweetText"]')?.textContent ?? '';
    const mediaUrls = [...new Set([...article.querySelectorAll('img[src], video[poster]')].map(image => image.getAttribute('src') || image.getAttribute('poster') || '')
      .filter(url => /^https:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb|amplify_video_thumb)\//.test(url)))].slice(0, 4);
    const truncated = Boolean(article.querySelector('[data-testid="tweet-text-show-more-link"]')) || /(?:…|\.\.\.)\s*$/.test(text);
    return { url: anchor?.getAttribute('href') ?? '', publishedAt: time?.getAttribute('datetime') ?? '', text, mediaUrls, truncated };
  }));
  return candidates.flatMap(post => {
    const id = canonicalPostUrl(post.url);
    return id && (post.text.trim() || post.mediaUrls.length) && Number.isFinite(Date.parse(post.publishedAt))
      ? [{ ...id, publishedAt: post.publishedAt, mediaUrls: post.mediaUrls, text: post.text.trim().slice(0, 20_000),
        contentState: !post.text.trim() ? 'media_only' as const : post.truncated ? 'possibly_truncated' as const : 'text' as const }] : [];
  });
}

/** A new, signed-out browser context; no existing user profile, cookies, or sessions. */
export async function collectPublicPosts(): Promise<CollectionResult> {
  const executablePath = browserExecutable();
  if (!executablePath) return { posts: [], state: 'blocked', observedCount: 0,
    message: 'No supported local Chrome, Edge, or Chromium executable found. Set MANZIL_BROWSER_EXECUTABLE or import a notice manually. No browser is downloaded automatically.' };
  let browser: Browser | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  let phase = 'browser launch';
  const posts = new Map<string, PublicPost>();
  try {
    browser = await chromium.launch({ executablePath, headless: true, timeout: 10_000 });
    timeout = setTimeout(() => { void browser?.close().catch(() => {}); }, Math.max(1000, 43_000 - (Date.now() - started)));
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    phase = 'public profile navigation';
    const response = await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    if (response && [401, 403, 429].includes(response.status())) return { posts: [], state: 'blocked', observedCount: 0,
      message: `X returned HTTP ${response.status()} to a signed-out visitor. Collection stopped; manual import remains available.` };
    phase = 'public profile inspection';
    // Only inspect the normal public UI. Never interact with login or challenge controls.
    await page.locator('article, [data-testid="primaryColumn"]').first().waitFor({ timeout: 7000 }).catch(() => {});
    for (let pass = 0; pass < 3 && Date.now() - started < 28_000; pass++) {
      for (const post of await visiblePosts(page)) posts.set(post.sourceId, post);
      if (pass < 2) { await page.mouse.wheel(0, 900); await page.waitForTimeout(1200); }
    }
    if (!posts.size) {
      const body = (await page.locator('body').innerText()).slice(0, 12_000);
      const blocked = /log in|sign in|sign up|something went wrong|verify|captcha|rate limit|not supported/i.test(body);
      return { posts: [], observedCount: 0, state: blocked ? 'blocked' : 'partial', message: blocked
        ? 'X did not expose timestamped public posts to this signed-out browser (login, error, or challenge page). No bypass was attempted. Import public notices manually.'
        : 'No timestamped posts by the configured author were visible. This check cannot establish whether new posts exist. Import notices manually if needed.' };
    }
    // A few canonical public permalinks can expose full text where the profile card was truncated.
    for (const post of [...posts.values()].filter(item => eligiblePost(item, Date.now())).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 3)) {
      if (Date.now() - started > 34_000) break;
      try {
        phase = 'visible public permalink inspection';
        await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 4000 });
        await page.locator('article').first().waitFor({ timeout: 1500 });
        const expanded = (await visiblePosts(page)).find(item => item.sourceId === post.sourceId);
        if (expanded && (expanded.text.length >= post.text.length || expanded.mediaUrls.length > post.mediaUrls.length)) posts.set(post.sourceId, expanded);
      } catch { /* Keep the publicly visible profile text, with partial coverage stated. */ }
    }
    return { posts: [...posts.values()], observedCount: posts.size, state: 'partial',
      message: 'Inspected a bounded signed-out public profile and up to three visible post permalinks. Coverage is partial: missing posts, images, deleted posts, and text truncation may be missed. Raw notices await your agent.' };
  } catch (error) {
    const networkCode = error instanceof Error ? error.message.match(/net::(ERR_[A-Z_]+)/)?.[1] : undefined;
    const category = error instanceof Error && error.name === 'TimeoutError' ? 'time limit'
      : networkCode ? `network access error: ${networkCode}` : 'browser operation error';
    return { posts: [...posts.values()], observedCount: posts.size, state: posts.size ? 'partial' : 'error',
      message: `The bounded signed-out check stopped during ${phase} (${category}). No login or access-control bypass was attempted. Manual import is available.` };
  } finally {
    if (timeout) clearTimeout(timeout);
    await browser?.close().catch(() => {});
  }
}

export class SourceService {
  private running: Promise<SourceStatus> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private store: Repository, private collector: Collector = collectPublicPosts) {}
  async settings(enabled: boolean): Promise<SourceStatus> {
    return this.store.updateSourceStatus({ enabled, intervalMinutes: 15,
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
    // API startup never waits for a browser. A missed deadline is caught up once after restart.
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
    await this.store.updateSourceStatus({ lastAttemptAt: new Date(now).toISOString(), state: 'checking',
      nextCheckAt: new Date(now + INTERVAL_MS).toISOString(), message: 'Checking the signed-out public profile. Coverage is partial.' });
    try {
      const result = await this.collector();
      let changed = 0, skipped = 0;
      for (const post of result.posts) {
        const canonical = canonicalPostUrl(post.url);
        if (!canonical || canonical.sourceId !== post.sourceId || !eligiblePost(post, now)) { skipped++; continue; }
        const input = { source: 'x' as const, ...canonical, text: post.text.slice(0, 20_000), publishedAt: new Date(post.publishedAt).toISOString(),
          mediaUrls: post.mediaUrls.filter(value => /^https:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb|amplify_video_thumb)\//.test(value)).slice(0, 4),
          contentState: post.contentState ?? (!post.text.trim() ? 'media_only' : 'text') };
        if ((await this.store.upsertNotice({ ...input, contentHash: contentHash(input) })).changed) changed++;
      }
      await this.store.setMeta('sourceCoverage', { checkedAt: new Date(now).toISOString(), observedCount: result.observedCount,
        latestObservedId: result.posts.map(post => post.sourceId).sort((a, b) => a.length - b.length || a.localeCompare(b)).at(-1) ?? null,
        skipped, changed, completeHistory: false });
      const current = await this.store.sourceStatus();
      const status = await this.store.updateSourceStatus({ state: current.enabled ? result.state : 'disabled',
        lastSuccessAt: result.posts.length ? new Date().toISOString() : current.lastSuccessAt,
        message: `${result.message} ${changed} new or edited notices queued; ${skipped} outside the date/author window skipped.` });
      await this.store.addSourceRun({ startedAt: new Date(now).toISOString(), finishedAt: new Date().toISOString(),
        state: status.state, observedCount: result.observedCount, changed, skipped, coverage: 'partial' });
      return status;
    } catch {
      return this.store.updateSourceStatus({ state: (await this.store.sourceStatus()).enabled ? 'error' : 'disabled',
        message: 'Source collection failed. Existing data is retained; the next scheduled check will retry. Manual import remains available.' });
    } finally { await this.store.releaseSourceLease(); }
  }
}
