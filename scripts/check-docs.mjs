import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve, relative, dirname, extname, isAbsolute, sep, win32 } from 'node:path';

// Offline check: only repository-local targets are checked, never external sites.
const root = resolve(import.meta.dirname, '..');
function localPathError(path) {
  const inside = relative(root, path);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return 'target outside repository';
  // Reject symlinks/junctions before following them, including Windows SMB links.
  let current = root;
  for (const part of inside.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) return 'symlink/junction target is not checked';
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') break;
      return `unreadable target (${error.code})`;
    }
  }
  return null;
}
function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}
const files = [
  ...readdirSync(root).filter(name => name.endsWith('.md')).map(name => resolve(root, name)),
  ...markdownFiles(resolve(root, 'docs')),
  ...markdownFiles(resolve(root, 'assets/brand')),
  ...markdownFiles(resolve(root, 'public/audio')),
];
const withoutFences = source => source.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm, '');
const cache = new Map();
function anchors(path) {
  if (cache.has(path)) return cache.get(path);
  const source = withoutFences(readFileSync(path, 'utf8'));
  const result = new Set();
  for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1].replace(/<[^>]*>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
    let slug = base;
    for (let n = 1; result.has(slug); n++) slug = `${base}-${n}`;
    result.add(slug);
  }
  for (const match of source.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  cache.set(path, result);
  return result;
}

const errors = [];
let checked = 0;
for (const file of files) {
  const fileError = localPathError(file);
  if (fileError) {
    errors.push(`${relative(root, file)}: ${fileError}`);
    continue;
  }
  const source = withoutFences(readFileSync(file, 'utf8'));
  const targets = [
    ...[...source.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g)].map(match => match[1]),
    ...[...source.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)].map(match => match[1]),
    ...[...source.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]),
  ];
  for (let target of targets) {
    target = target.replace(/^<|>$/g, '').replaceAll('&amp;', '&');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    checked++;
    const hash = target.indexOf('#');
    let pathPart = hash < 0 ? target : target.slice(0, hash);
    let fragment = hash < 0 ? '' : target.slice(hash + 1);
    try {
      pathPart = decodeURIComponent(pathPart.split('?')[0]);
      fragment = decodeURIComponent(fragment);
    } catch {
      errors.push(`${relative(root, file)}: invalid encoding in ${target}`);
      continue;
    }
    if (pathPart.includes('\\') || win32.isAbsolute(pathPart) && !pathPart.startsWith('/')) {
      errors.push(`${relative(root, file)}: unsupported absolute/network target ${target}`);
      continue;
    }
    const path = pathPart ? resolve(pathPart.startsWith('/') ? root : dirname(file), pathPart.replace(/^\//, '')) : file;
    const pathError = localPathError(path);
    if (pathError) errors.push(`${relative(root, file)}: ${pathError}: ${target}`);
    else if (!existsSync(path)) errors.push(`${relative(root, file)}: missing target ${target}`);
    else if (fragment && extname(path) === '.md' && !lstatSync(path).isFile()) errors.push(`${relative(root, file)}: section target is not a file: ${target}`);
    else if (fragment && extname(path) === '.md' && !anchors(path).has(fragment)) {
      errors.push(`${relative(root, file)}: missing section ${target}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`Documentation check failed: ${errors.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed: ${files.length} Markdown files, ${checked} local links/anchors. External links were not requested.`);
}
