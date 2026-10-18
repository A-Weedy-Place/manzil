import { describe, expect, it, vi } from 'vitest';
import { collectPublicPosts, eligiblePost, parsePublicPosts, PROFILE_URL } from '../server/source';
import { MAX_SOURCE_BYTES } from '../server/source-html';

const at = '2026-10-17T10:00:00.000Z', now = Date.parse('2026-10-17T12:00:00.000Z');
function article(id = '123', options: { full?: boolean; edited?: boolean; pinned?: boolean; body?: string; author?: string; timestamp?: string; suffix?: string } = {}) {
  const author = options.author ?? 'shaheryarhassan';
  return `<article>${options.pinned ? '<div>Pinned</div>' : ''}<div><a href="/${author}/status/${id}${options.edited ? '/history' : ''}">${options.edited ? 'Last edited ' : ''}${options.full ? '10:00 AM' : '2h'}<script>window.__xClientTextFormatters?.run("fixture", "${options.full ? 'formatFullTimestamp' : 'formatRelativeTimestamp'}", {"lang":"en","timestamp":${Date.parse(options.timestamp ?? at)}});</script></a><div class="text-body whitespace-pre-wrap">${options.body ?? 'Synthetic road advisory'}</div>${options.suffix ?? ''}</div></article>`;
}
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const fetcher = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => vi.fn(handler) as unknown as typeof fetch;

describe('public source HTML evidence', () => {
  it('reads the observed markup without pretending a relative profile time is original publication', () => {
    const result = parsePublicPosts(article());
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({ sourceId: '123', text: 'Synthetic road advisory', publishedAt: null, sourceTimestamp: { at, kind: 'displayed' } });
  });
  it('binds a sibling formatter to the timestamp span inside the matching post link', () => {
    const markup = article().replace('2h<script>', '2h<span id="fixture"></span></a><script>').replace('</script></a>', '</script>');
    expect(parsePublicPosts(markup).posts[0]).toMatchObject({ sourceTimestamp: { at, kind: 'displayed' } });
    expect(parsePublicPosts(markup.replace('id="fixture"', 'id="unrelated"')).posts).toEqual([]);
  });
  it('reads classic time/tweetText markup, entities, line breaks and Urdu without script pollution', () => {
    const result = parsePublicPosts(`<article><a href="/shaheryarhassan/status/123"><time datetime="${at}">2h</time></a><div data-testid="tweetText">Road &amp; bridge<br>سڑک بند<script>throw new Error('not executed')</script><style>hidden</style></div></article>`);
    expect(result.posts[0]).toMatchObject({ text: 'Road & bridge\nسڑک بند', publishedAt: at });
  });
  it('keeps an edit-only timestamp separate and accepts the raw evidence for later review', () => {
    const post = parsePublicPosts(article('123', { full: true, edited: true }), '123').posts[0];
    expect(post).toMatchObject({ publishedAt: null, sourceTimestamp: { at, kind: 'edited' } });
    expect(eligiblePost(post, now)).toBe(true);
    expect(eligiblePost({ ...post, pinned: true }, now)).toBe(false);
  });
  it('deduplicates duplicate detail layouts and requires the requested post identity', () => {
    expect(parsePublicPosts(article('123', { full: true }).repeat(2), '123').posts).toHaveLength(1);
    expect(parsePublicPosts(article('124', { full: true }), '123').posts).toEqual([]);
    expect(parsePublicPosts(article('123', { full: true }), '123').posts[0].publishedAt).toBe(at);
  });
  it('does not attribute foreign articles or quoted timestamps/text to Champ', () => {
    expect(parsePublicPosts(article('123', { author: 'other', suffix: article('456') })).posts).toEqual([]);
    const quoted = `<div data-testid="quoteTweet">${article('456', { timestamp: '2026-10-18T10:00:00Z', body: 'Quoted evidence' })}</div>`;
    expect(parsePublicPosts(article('123', { suffix: quoted })).posts.map(p => p.sourceId)).toEqual(['123']);
  });
  it('ignores missing, relative-only, malformed and conflicting timestamp evidence', () => {
    expect(parsePublicPosts('<article><a href="/shaheryarhassan/status/123">5m</a><div class="whitespace-pre-wrap">Fixture</div></article>').posts).toEqual([]);
    expect(parsePublicPosts(article().replace('1792231200000', 'null')).posts).toEqual([]);
    const conflicting = `<a href="/shaheryarhassan/status/123"><time datetime="2026-10-17T11:00:00Z">1h</time><time datetime="2026-10-17T10:00:00Z">2h</time></a>`;
    expect(parsePublicPosts(article('123', { suffix: conflicting })).posts).toEqual([]);
  });
  it('keeps a pinned old post out of intake and never infers a timestamp from its position', () => {
    const old = article('111', { timestamp: '2023-09-24T15:29:02Z', pinned: true, full: true });
    const posts = parsePublicPosts(old + article('123', { full: true }));
    expect(posts.observedCount).toBe(2);
    expect(posts.posts.filter(p => eligiblePost(p, now)).map(p => p.sourceId)).toEqual(['123']);
  });
  it('preserves media-only evidence but accepts media references only from the exact public media host', () => {
    const suffix = '<img src="https://pbs.twimg.com/media/fixture.jpg"><img src="https://pbs.twimg.com.evil.test/media/bad.jpg"><img src="https://user@pbs.twimg.com/media/bad.jpg"><img src="https://pbs.twimg.com/profile_images/avatar.jpg">';
    const post = parsePublicPosts(article('123', { body: '', suffix })).posts[0];
    expect(post).toMatchObject({ text: '', contentState: 'media_only', mediaUrls: ['https://pbs.twimg.com/media/fixture.jpg'] });
  });
  it('bounds HTML size and article inspection and marks shortened content', () => {
    expect(() => parsePublicPosts('x'.repeat(MAX_SOURCE_BYTES + 1))).toThrow(/limit/);
    expect(parsePublicPosts(Array.from({ length: 50 }, (_, n) => article(String(n))).join('')).observedCount).toBe(35);
    expect(parsePublicPosts(article('123', { body: 'Fixture…' })).posts[0].contentState).toBe('possibly_truncated');
    expect(parsePublicPosts(article('123', { suffix: '<button>Show more</button>' })).posts[0].contentState).toBe('possibly_truncated');
  });
});

describe('bounded public HTTPS collection', () => {
  it('reports request timeouts separately from network and HTTP failures without exposing raw errors', async () => {
    const cases = [
      { error: new DOMException('private timeout fixture', 'TimeoutError'), failure: 'request_timeout', code: undefined },
      { error: new TypeError('private network fixture', { cause: Object.assign(new Error('private host fixture'), { code: 'ENOTFOUND' }) }), failure: 'network', code: 'ENOTFOUND' },
    ];
    for (const item of cases) {
      const result = await collectPublicPosts({ fetcher: fetcher(() => Promise.reject(item.error)), now });
      expect(result).toMatchObject({ state: 'error', diagnostics: [{ stage: 'profile', url: PROFILE_URL, httpStatus: null, failure: item.failure }] });
      expect(result.diagnostics?.[0].networkCode).toBe(item.code);
      expect(JSON.stringify(result)).not.toContain('private');
    }
    const denied = await collectPublicPosts({ fetcher: fetcher(() => html('Forbidden', 403)), now });
    expect(denied).toMatchObject({ state: 'blocked', diagnostics: [{ httpStatus: 403, failure: 'http_status' }] });
  });
  it('retains successful profile and failed detail diagnostics independently', async () => {
    const result = await collectPublicPosts({ fetcher: fetcher(url => url === PROFILE_URL ? html(article()) : html('{}', 503)), now });
    expect(result.diagnostics).toMatchObject([
      { stage: 'profile', httpStatus: 200, failure: null },
      { stage: 'detail', httpStatus: 503, failure: 'http_status' },
    ]);
    expect(result.diagnostics?.every(item => item.elapsedMs >= 0)).toBe(true);
  });
  it('fetches only the allowlisted profile and four recent canonical details with no cookies or redirects', async () => {
    const profile = article('111', { pinned: true, timestamp: '2023-09-24T15:29:02Z' }) + Array.from({ length: 6 }, (_, n) => article(String(n + 123))).join('');
    const mock = fetcher((url, init) => {
      expect(init?.redirect).toBe('manual'); expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toEqual({ Accept: 'text/html,application/xhtml+xml' });
      if (url === PROFILE_URL) return html(profile);
      const id = url.split('/').at(-1)!;
      expect(url).toBe(`${PROFILE_URL}/status/${id}`);
      return html(article(id, { full: true, edited: id === '123' }));
    });
    const result = await collectPublicPosts({ fetcher: mock, now });
    expect(mock).toHaveBeenCalledTimes(5); expect(result.state).toBe('partial'); expect(result.observedCount).toBe(7);
    expect(result.posts).toHaveLength(4); expect(result.posts[0].publishedAt).toBeNull();
  });
  it.each([302, 401, 403, 429])('stops immediately on blocked/redirected profile status %s', async status => {
    const mock = fetcher(() => html('Sign in', status));
    expect(await collectPublicPosts({ fetcher: mock, now })).toMatchObject({ state: 'blocked', posts: [] });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('stops after a blocked detail rather than seeking another source', async () => {
    const mock = fetcher(url => url === PROFILE_URL ? html(article() + article('124')) : html('Blocked', 403));
    expect(await collectPublicPosts({ fetcher: mock, now })).toMatchObject({ state: 'blocked', posts: [] });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it('rejects the wrong content type, oversized bodies and stream failures without claiming success', async () => {
    const bodies = [new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      html('x'.repeat(MAX_SOURCE_BYTES + 1)),
      new Response(new ReadableStream({ start(controller) { controller.error(new Error('Fixture stream error')); } }), { headers: { 'Content-Type': 'text/html' } })];
    for (const response of bodies) expect(await collectPublicPosts({ fetcher: fetcher(() => response), now })).toMatchObject({ state: 'error', posts: [] });
  });
  it('does not queue ambiguous profile timestamps when detail loading fails', async () => {
    const mock = fetcher(url => url === PROFILE_URL ? html(article()) : Promise.reject(new Error('Network fixture')));
    expect(await collectPublicPosts({ fetcher: mock, now })).toMatchObject({ state: 'partial', posts: [] });
  });
  it('reports a login shell as blocked instead of an empty healthy feed', async () => {
    expect(await collectPublicPosts({ fetcher: fetcher(() => html('<h1>Sign in to X</h1>')), now })).toMatchObject({ state: 'blocked', posts: [], observedCount: 0 });
  });
});
