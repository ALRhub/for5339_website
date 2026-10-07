// Offline copy of the built site, to open index.html straight from a folder or network drive
// without a web server. Browsers treat file:// pages differently from a server: root-relative
// links, JavaScript module files and fonts from parent folders do not load there. So this copies
// dist/ to release/for5339-website/, makes every internal link relative (with an explicit
// index.html), inlines the JavaScript modules and embeds the Latin fonts in the stylesheets.
// If OFFLINE_COPY_DIR is set (in the environment or a local, untracked .env file), it then
// mirrors the copy to that folder, for example a shared network drive.
//
// Runs as part of `npm run build`.
import { copyFile, cp, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'release', 'for5339-website');

async function files(dir, ext) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(p, ext)));
    else if (p.endsWith(ext)) found.push(p);
  }
  return found;
}

// "/research/" seen from "subprojects/m2/index.html" becomes "../../research/index.html"
function relative(url, fromFile) {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const [, pathname, rest = ''] = url.match(/^([^?#]*)(.*)$/);
  let target = pathname;
  if (target.endsWith('/')) target += 'index.html';
  else if (!path.posix.extname(target)) target += '/index.html';
  const fromDir = path.posix.dirname(path.relative(out, fromFile).split(path.sep).join('/'));
  return path.posix.relative(fromDir, target.slice(1)) + rest;
}

await rm(out, { recursive: true, force: true });
await mkdir(path.dirname(out), { recursive: true });
await cp(dist, out, { recursive: true });

// Stylesheets: embed the Latin fonts (the only ones the English site uses); other files by relative path.
for (const css of await files(path.join(out, '_astro'), '.css')) {
  let text = await readFile(css, 'utf8');
  const urls = [...new Set([...text.matchAll(/url\((\/_astro\/[^)]+)\)/g)].map((m) => m[1]))];
  for (const url of urls) {
    const name = path.posix.basename(url);
    const embed = /ibm-plex-sans-latin(-ext)?-wdth-(normal|italic)\.[^.]+\.woff2$/.test(name);
    const value = embed ? `data:font/woff2;base64,${(await readFile(path.join(out, url))).toString('base64')}` : `./${name}`;
    text = text.split(`url(${url})`).join(`url(${value})`);
  }
  await writeFile(css, text);
}

// Pages: inline the module scripts and make internal URLs relative.
const bundles = new Map();
for (const html of await files(out, '.html')) {
  let text = await readFile(html, 'utf8');
  for (const [tag, src] of [...text.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => [m[0], m[1]])) {
    if (!bundles.has(src)) {
      const result = await build({ entryPoints: [path.join(out, src)], bundle: true, format: 'esm', minify: true, write: false, logLevel: 'error' });
      bundles.set(src, result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
    }
    text = text.split(tag).join(`<script type="module">${bundles.get(src)}</script>`);
  }
  text = text.replace(/\b(href|src|poster)="(\/[^"]*)"/g, (_, attr, url) => `${attr}="${relative(url, html)}"`);
  text = text.replace(/\bsrcset="([^"]*)"/g, (_, set) => `srcset="${set.split(',').map((part) => {
    const [url, ...descriptor] = part.trim().split(/\s+/);
    return [relative(url, html), ...descriptor].join(' ');
  }).join(', ')}"`);
  await writeFile(html, text);
}

// The bundled scripts now live inside the pages.
for (const src of bundles.keys()) await rm(path.join(out, src));

const date = new Date().toISOString().slice(0, 10);
await writeFile(path.join(out, 'README.txt'), `KI-FOR 5339 website, offline copy built on ${date}.

Open index.html in a web browser. Everything the site needs is in this folder, so it works
without a web server or an internet connection; only links to external websites need the internet.

Built with "npm run build" from the website repository. Rebuild rather than edit these files.
`);
console.log(`Offline copy written to ${path.relative(root, out)}/ (${bundles.size} script bundle(s) inlined)`);

// ---- mirror to the shared folder: copy what changed, remove what the site no longer has
const shared = process.env.OFFLINE_COPY_DIR;
const exists = async (p) => stat(p).then(() => true, () => false);
if (!shared) console.log('No shared copy (OFFLINE_COPY_DIR is not set).');
else if (!(await exists(path.dirname(shared)))) console.log(`Shared copy skipped: ${path.dirname(shared)} is not reachable.`);
else {
  // only ever replace an earlier copy of the site, never a folder with other content
  const entries = (await exists(shared)) ? await readdir(shared) : [];
  const marker = entries.includes('README.txt') ? await readFile(path.join(shared, 'README.txt'), 'utf8') : '';
  if (entries.length && !marker.startsWith('KI-FOR 5339 website, offline copy')) {
    console.log(`Shared copy skipped: ${shared} holds other files, not an offline copy of the site.`);
  } else {
    let copied = 0, removed = 0;
    const want = new Set();
    for (const file of await files(out, '')) {
      const rel = path.relative(out, file);
      want.add(rel);
      const target = path.join(shared, rel);
      const fresh = await readFile(file);
      const old = await readFile(target).catch(() => null);
      if (old && old.equals(fresh)) continue;
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file, target);
      copied++;
    }
    for (const file of await files(shared, '')) {
      if (want.has(path.relative(shared, file))) continue;
      await rm(file);
      removed++;
    }
    // drop folders left empty
    const prune = async (dir) => {
      for (const e of await readdir(dir, { withFileTypes: true })) if (e.isDirectory()) await prune(path.join(dir, e.name));
      if (dir !== shared && !(await readdir(dir)).length) await rmdir(dir);
    };
    await prune(shared);
    console.log(`Shared copy updated in ${shared}: ${copied} file(s) copied, ${removed} removed, ${want.size} in total.`);
  }
}
