import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';

export const PROFILE_URL = 'https://x.com/shaheryarhassan';
const AUTHOR = 'shaheryarhassan';
export const MAX_SOURCE_BYTES = 2_000_000;
export interface PublicPost {
  sourceId: string; url: string; text: string; publishedAt: string | null; mediaUrls: string[];
  sourceTimestamp?: { at: string; kind: 'published' | 'edited' | 'displayed' };
  pinned?: boolean;
  contentState?: 'text' | 'media_only' | 'possibly_truncated';
}
export function canonicalPostUrl(value: string): { sourceId: string; url: string } | null {
  try {
    const url = new URL(value, PROFILE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
    return match?.[1].toLowerCase() === AUTHOR ? { sourceId: match[2], url: `${PROFILE_URL}/status/${match[2]}` } : null;
  } catch { return null; }
}
const element = (node: Tree.Node): node is Tree.Element => 'tagName' in node;
const attr = (node: Tree.Element, name: string) => node.attrs.find(item => item.name === name)?.value;
const hasClass = (node: Tree.Element, name: string) => (attr(node, 'class') ?? '').split(/\s+/).includes(name);
function* elements(root: Tree.Node): Generator<Tree.Element> {
  const stack: Tree.Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (element(node)) {
      if (node !== root && (node.tagName === 'article' || node.tagName === 'blockquote' || attr(node, 'data-testid') === 'quoteTweet' ||
        node.tagName === 'div' && attr(node, 'role') === 'link')) continue;
      yield node;
    }
    if ('childNodes' in node) stack.push(...[...node.childNodes].reverse());
  }
}
/** Text only: script/style/template contents are never executed or copied into evidence. */
function text(root: Tree.Node, rawScript = false): string {
  const stack: Tree.Node[] = [root]; let result = '';
  while (stack.length) {
    const node = stack.pop()!;
    if ('value' in node && node.nodeName === '#text') result += node.value;
    if (element(node)) {
      if (!rawScript && ['script', 'style', 'template', 'noscript'].includes(node.tagName)) continue;
      if (attr(node, 'aria-hidden') === 'true' || node.attrs.some(a => a.name === 'hidden')) continue;
      if (node.tagName === 'br') result += '\n';
      if (node.tagName === 'img') result += attr(node, 'alt') ?? '';
    }
    if ('childNodes' in node) stack.push(...[...node.childNodes].reverse());
  }
  return result.trim();
}
function iso(value?: string | number): string | null {
  if (value === undefined || typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const at = new Date(value); return Number.isFinite(at.getTime()) ? at.toISOString() : null;
}
function postLink(node: Tree.Element) {
  const href = attr(node, 'href');
  return node.tagName === 'a' && href ? canonicalPostUrl(href.replace(/\/history\/?(?=[?#]|$)/, '')) : null;
}
export function sourceMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && !url.port && !url.username && !url.password &&
      /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb)\//.test(url.pathname);
  } catch { return false; }
}

export function parsePublicPosts(html: string, detailId?: string): { posts: PublicPost[]; observedCount: number; blocked: boolean } {
  if (Buffer.byteLength(html) > MAX_SOURCE_BYTES) throw new Error('Public HTML exceeds the source limit.');
  const document = parse(html);
  // Find top-level articles, excluding nested quoted posts.
  const stack: Tree.Node[] = [document], articles: Tree.Element[] = [];
  while (stack.length && articles.length < 35) {
    const node = stack.pop()!;
    if (element(node) && node.tagName === 'article') { articles.push(node); continue; }
    if ('childNodes' in node) stack.push(...[...node.childNodes].reverse());
  }
  const posts = new Map<string, PublicPost>();
  for (const article of articles) {
    const nodes = [...elements(article)];
    const body = nodes.find(node => attr(node, 'data-testid') === 'tweetText' || hasClass(node, 'whitespace-pre-wrap'));
    // Select the first status anchor outside the post body, including foreign authors.
    // Otherwise a quoted/linked Champ tweet could misattribute somebody else's article.
    const bodyNodes = new Set(body ? [...elements(body)] : []);
    const first = nodes.find(node => node.tagName === 'a' && !bodyNodes.has(node) &&
      /\/[^/]+\/status\/\d+(?:\/history)?\/?(?:[?#]|$)/.test(attr(node, 'href') ?? ''));
    const identity = first && postLink(first);
    if (!identity || detailId && identity.sourceId !== detailId) continue;
    const anchors = nodes.filter(node => !bodyNodes.has(node) && postLink(node)?.sourceId === identity.sourceId);
    const times: NonNullable<PublicPost['sourceTimestamp']>[] = [];
    for (const anchor of anchors) {
      const edited = /last edited/i.test(text(anchor)) || /\/history\/?(?:[?#]|$)/.test(attr(anchor, 'href') ?? '');
      const scoped = [...elements(anchor)];
      for (const node of scoped) {
        if (node.tagName === 'time') {
          const at = iso(attr(node, 'datetime'));
          if (at) times.push({ at, kind: edited ? 'edited' : 'published' });
        }
      }
      // The formatter script can be a sibling of its anchor. Bind its target ID
      // to an element inside this exact post's date link, not any script on the page.
      for (const node of nodes.filter(node => node.tagName === 'script')) {
        // Only JSON arguments to the observed timestamp formatter; never eval page scripts.
        for (const match of text(node, true).matchAll(/window\.__xClientTextFormatters\?\.run\(\s*"([^"\n]{1,120})"\s*,\s*"(format\w*Timestamp)"\s*,\s*(\{[^{}]{1,300}\})\s*\)/g)) {
          if (!scoped.includes(node) && !scoped.some(target => attr(target, 'id') === match[1])) continue;
          try {
            const data = JSON.parse(match[3]) as { timestamp?: unknown };
            const at = typeof data.timestamp === 'number' && Number.isSafeInteger(data.timestamp) && data.timestamp >= 1_288_834_974_657 ? iso(data.timestamp) : null;
            if (at) times.push({ at, kind: edited ? 'edited' : detailId && match[2] === 'formatFullTimestamp' ? 'published' : 'displayed' });
          } catch { /* Incomplete/unrecognized formatter data is not a timestamp. */ }
        }
      }
    }
    // An edited time and a creation time can coexist; conflicting values of either kind cannot.
    if (['published', 'edited', 'displayed'].some(kind => new Set(times.filter(t => t.kind === kind).map(t => t.at)).size > 1)) continue;
    const publishedAt = times.find(t => t.kind === 'published')?.at ?? null;
    const sourceTimestamp = times.find(t => t.kind === 'edited') ?? times.find(t => t.kind === 'published') ?? times[0];
    if (!sourceTimestamp) continue;
    const rawText = body ? text(body) : '';
    const mediaUrls = [...new Set(nodes.flatMap(node => {
      const value = node.tagName === 'img' ? attr(node, 'src') : node.tagName === 'video' ? attr(node, 'poster') : undefined;
      return value && sourceMediaUrl(value) ? [value] : [];
    }))].slice(0, 4);
    if (!rawText && !mediaUrls.length) continue;
    const pinned = nodes.some(node => attr(node, 'data-testid') === 'socialContext' && /\bpinned\b/i.test(text(node))) ||
      !!article.childNodes.find(node => element(node) && node.tagName === 'div' && text(node).length < 80 && /\bpinned\b/i.test(text(node)));
    const truncated = rawText.length > 20_000 || /(?:\u2026|\.\.\.)\s*$/.test(rawText) ||
      nodes.some(node => attr(node, 'data-testid') === 'tweet-text-show-more-link' ||
        ['button', 'a'].includes(node.tagName) && /^show more$/i.test(text(node)));
    const post: PublicPost = { ...identity, text: rawText.slice(0, 20_000), publishedAt, sourceTimestamp, pinned, mediaUrls,
      contentState: !rawText ? 'media_only' : truncated ? 'possibly_truncated' : 'text' };
    const previous = posts.get(post.sourceId);
    if (!previous || post.text.length > previous.text.length) posts.set(post.sourceId, post);
  }
  return { posts: [...posts.values()], observedCount: articles.length,
    blocked: !posts.size && /log in|sign in|sign up|verify|captcha|rate limit|something went wrong/i.test(text(document)) };
}
