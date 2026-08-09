#!/usr/bin/env node
/**
 * Voyeur catalog site builder.
 *
 * Zero dependencies. Node 18+. Run from anywhere:
 *   node site/build.js
 *
 * Reads every apps/<slug>/manifest.json in the repo and writes static HTML to
 * site/dist/. A malformed or invalid manifest is skipped with a loud warning —
 * one bad file must never cost us the whole catalog, because nobody is watching.
 *
 * Flags:
 *   --strict   exit non-zero if any warnings were emitted (for local checking;
 *              the unattended pipeline should NOT use this)
 * Env:
 *   SITE_URL   absolute origin (production: https://voyeur-catalog.vercel.app).
 *              When set, canonical links and a sitemap.xml are emitted. Omitted
 *              when unset — a wrong canonical URL is worse than none.
 *   BASE_PATH  prefix for internal links when served from a subpath.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SITE_DIR = __dirname;
const REPO_ROOT = path.resolve(SITE_DIR, '..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const OUT_DIR = path.join(SITE_DIR, 'dist');

const REPO_URL = 'https://github.com/avikabra/voyeur';
const REPO_TREE = REPO_URL + '/tree/main';

const STRICT = process.argv.includes('--strict');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
// BASE_PATH: prefix for all internal links when the site is served from a
// subpath (e.g. "/voyeur" on GitHub Pages project sites). Empty = site root.
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');
function u(p) {
  return BASE + p;
}

const STATUSES = {
  live: { label: 'Live', note: '' },
  wip: { label: 'In progress', note: 'Still being built. It may be incomplete.' },
  broken: { label: 'Broken', note: 'This app is currently broken.' },
  retired: { label: 'Retired', note: 'Retired. The source stays up.' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Favicon: a stylized serif-italic V matching the wordmark, inlined as a
// data URI. No favicon.ico request, no external asset anywhere on the site.
const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="6" fill="#faf9f7"/>' +
      '<text x="16" y="24" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-style="italic" font-weight="700" font-size="24" fill="#15171c">V</text>' +
      '</svg>'
  );

const warnings = [];
function warn(msg) {
  warnings.push(msg);
  console.warn('  !  WARNING  ' + msg);
}

// ---------------------------------------------------------------------------
// Escaping. Everything that comes out of a manifest goes through here.
// ---------------------------------------------------------------------------

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only http(s) and site-root-relative URLs survive. Everything else (javascript:,
 * data:, vbscript:, protocol-relative) returns null and the caller renders no link.
 */
function safeUrl(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

function shortenUrl(href, max) {
  const limit = max || 46;
  let text;
  try {
    const u = new URL(href);
    text = u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + (u.search || '');
  } catch (err) {
    text = href;
  }
  if (text.length > limit) text = text.slice(0, limit - 1) + '…';
  return text;
}

function formatDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return Number(m[3]) + ' ' + month + ' ' + m[1];
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function stringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(isNonEmptyString).map((s) => s.trim());
}

/**
 * A stable accent hue per app, derived from its slug (FNV-1a). Kept inside
 * 200-349deg — blues through violets to magenta — so every tile stays in the
 * same family as the house accent and no app draws a muddy olive.
 */
function hueFor(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 200 + ((h >>> 0) % 150);
}

/** First letter for the tile mark. Falls back to the accent V. */
function initialOf(name) {
  const m = /[A-Za-z0-9]/.exec(name || '');
  return m ? m[0].toUpperCase() : 'V';
}

// ---------------------------------------------------------------------------
// Manifest loading + validation
// ---------------------------------------------------------------------------

function loadManifests() {
  if (!fs.existsSync(APPS_DIR)) {
    console.log('  ·  no apps/ directory yet — building the empty catalog');
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  } catch (err) {
    warn('could not read apps/ (' + err.message + ') — building the empty catalog');
    return [];
  }

  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const dir = path.join(APPS_DIR, entry.name);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      warn('apps/' + entry.name + '/ has no manifest.json — skipped');
      continue;
    }

    let raw;
    try {
      raw = fs.readFileSync(manifestPath, 'utf8');
    } catch (err) {
      warn('apps/' + entry.name + '/manifest.json unreadable (' + err.message + ') — skipped');
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      warn('apps/' + entry.name + '/manifest.json is not valid JSON (' + err.message + ') — skipped');
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      warn('apps/' + entry.name + '/manifest.json is not a JSON object — skipped');
      continue;
    }

    const app = normalize(parsed, entry.name);
    if (app) apps.push(app);
  }

  // Newest first. Undated manifests sort last, then alphabetically by name.
  apps.sort((a, b) => {
    const ac = a.created || '';
    const bc = b.created || '';
    if (ac !== bc) {
      if (!ac) return 1;
      if (!bc) return -1;
      return ac < bc ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  return apps;
}

/**
 * site/coming.json — the builds the pipeline has already committed to, rendered
 * as muted "In the works" tiles. Optional by design: no file means no tiles and
 * no warning, so a clone without it still builds a clean catalog. A file that
 * exists but is broken does warn, because that is a mistake, not a choice.
 *
 * Shape: [{ "title": "...", "need": "one line" }]
 */
function loadComing() {
  const file = path.join(SITE_DIR, 'coming.json');
  if (!fs.existsSync(file)) return [];

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    warn('site/coming.json is unreadable (' + err.message + ') — no "In the works" tiles');
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warn('site/coming.json is not valid JSON (' + err.message + ') — no "In the works" tiles');
    return [];
  }

  if (!Array.isArray(parsed)) {
    warn('site/coming.json is not a JSON array — no "In the works" tiles');
    return [];
  }

  const out = [];
  parsed.forEach((entry, i) => {
    const where = 'site/coming.json entry ' + (i + 1);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warn(where + ' is not an object — skipped');
      return;
    }
    if (!isNonEmptyString(entry.title) || !isNonEmptyString(entry.need)) {
      warn(where + ' needs both "title" and "need" — skipped');
      return;
    }
    out.push({ title: entry.title.trim(), need: entry.need.trim() });
  });
  return out;
}

/**
 * Turn a parsed manifest into a render-ready object, or null if it can't be
 * rendered honestly. Required: slug, name, need, status. Everything else is
 * optional and degrades quietly.
 */
function normalize(m, dirName) {
  const where = 'apps/' + dirName + '/manifest.json';

  let slug = isNonEmptyString(m.slug) ? m.slug.trim() : '';
  if (!slug) {
    // Fall back to the directory name rather than losing the app entirely.
    slug = dirName;
    warn(where + ' has no "slug" — falling back to the directory name "' + dirName + '"');
  }
  // Charset is deliberately tight: the slug becomes a directory name and a URL
  // path segment, so no separators, no leading dot, no traversal.
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(slug) || slug.includes('..')) {
    warn(where + ' has an unusable slug "' + slug + '" (letters, digits, . _ - only) — skipped');
    return null;
  }
  if (slug !== dirName) {
    warn(where + ' slug "' + slug + '" does not match its directory "' + dirName + '" — using the slug');
  }

  if (!isNonEmptyString(m.name)) {
    warn(where + ' has no "name" — skipped');
    return null;
  }
  if (!isNonEmptyString(m.need)) {
    warn(where + ' has no "need" (the catalog headline) — skipped');
    return null;
  }
  if (!isNonEmptyString(m.status)) {
    warn(where + ' has no "status" — skipped');
    return null;
  }

  let status = m.status.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(STATUSES, status)) {
    warn(where + ' has unknown status "' + m.status + '" — treating it as "wip", not "live"');
    status = 'wip';
  }

  const liveUrl = safeUrl(m.liveUrl);
  if (m.liveUrl && !liveUrl) {
    warn(where + ' has a liveUrl that is not an http(s) URL — dropping the link');
  }
  if (status === 'live' && !liveUrl) {
    warn(where + ' is marked "live" but has no usable liveUrl — its tile will link to its details page');
  }

  const limitations = stringArray(m.limitations);
  if (limitations.length === 0 && (status === 'live' || status === 'broken')) {
    warn(where + ' has an empty "limitations" array — every app has limits (see docs/PRINCIPLES.md)');
  }

  const evidence = stringArray(m.evidence).map((line) => {
    const match = /^(\S+)(?:\s*[—–\-:]\s*|\s+)([\s\S]*)$/.exec(line);
    const candidate = match ? match[1] : line;
    const href = safeUrl(candidate);
    if (!href) return { href: null, text: line, note: '' };
    return { href: href, text: shortenUrl(href), note: match ? (match[2] || '').trim() : '' };
  });

  const created = isNonEmptyString(m.created) ? m.created.trim() : '';
  const updated = isNonEmptyString(m.updated) ? m.updated.trim() : '';
  if (created && !formatDate(created)) {
    warn(where + ' has a "created" date that is not YYYY-MM-DD — sorting may be off');
  }

  return {
    slug: slug,
    dirName: dirName,
    name: m.name.trim(),
    need: m.need.trim(),
    description: isNonEmptyString(m.description) ? m.description.trim() : '',
    limitations: limitations,
    evidence: evidence,
    status: status,
    liveUrl: liveUrl,
    created: created,
    updated: updated,
    tech: stringArray(m.tech),
    localRun: isNonEmptyString(m.localRun) ? m.localRun.trim() : '',
    license: isNonEmptyString(m.license) ? m.license.trim() : 'MIT',
  };
}

// ---------------------------------------------------------------------------
// Styles — inlined into every page. Light only. No external assets, no JS.
// ---------------------------------------------------------------------------

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#f4f5f8;
  --card:#ffffff;
  --ink:#14161b;
  --ink-soft:#454b56;
  --muted:#646b76;
  --line:#e4e6ec;
  --line-strong:#c9cdd6;
  --accent:#1550d0;
  --accent-dark:#0f3ea3;
  --accent-soft:#eef3fd;
  --accent-line:#c6d7f8;
  /* per-app accent hue, set inline from the slug. 220 is the house blue. */
  --h:220;
  --r:14px;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --serif:ui-serif,Georgia,"Iowan Old Style","Times New Roman",Times,serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;
  background:var(--bg);
  color:var(--ink);
  font-family:var(--sans);
  font-size:16px;
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  overflow-wrap:break-word;
  min-height:100vh;
  display:flex;
  flex-direction:column;
}
main{flex:1}
.wrap{width:100%;max-width:68rem;margin:0 auto;padding:0 1.15rem}
.wrap.narrow{max-width:44rem}
.page{padding-top:1.6rem;padding-bottom:2.75rem}
a{color:var(--accent);text-underline-offset:.15em}
a:hover{color:var(--accent-dark)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:5px}
img{max-width:100%;height:auto}

/* header + hero -------------------------------------------------------- */
.top{background:var(--card);border-bottom:1px solid var(--line)}
.top .wrap{padding-top:.85rem;padding-bottom:.85rem}
.bar{display:flex;align-items:center;justify-content:space-between;gap:.6rem 1rem;flex-wrap:wrap}
.brand{margin:0;font-family:var(--serif);font-size:1.2rem;font-weight:700;letter-spacing:.005em;line-height:1.15}
.brand a{color:var(--ink);text-decoration:none}
.brand a:hover{color:var(--accent)}
.nav{display:flex;align-items:center;gap:.1rem;font-size:.88rem}
.nav a{color:var(--muted);text-decoration:none;padding:.2rem .4rem;border-radius:6px}
.nav a:hover{color:var(--accent);background:var(--accent-soft)}
.nav span{color:var(--line-strong)}

.hero{position:relative;overflow:hidden;border-bottom:1px solid var(--line);
  background:
    radial-gradient(42rem 18rem at 6% -45%,hsla(220,86%,54%,.14),rgba(255,255,255,0) 68%),
    linear-gradient(180deg,#ffffff 0%,#fafbfe 100%);
}
.hero::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background-image:radial-gradient(hsla(222,20%,44%,.20) 1px,rgba(0,0,0,0) 1px);
  background-size:22px 22px;
  -webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,0) 74%);
  mask-image:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,0) 74%);
}
.hero .wrap{position:relative;z-index:1;padding-top:1.5rem;padding-bottom:1.7rem}
.hero .brand{font-size:2.1rem;letter-spacing:-.01em}
.hero .stat{
  margin:.75rem 0 0;display:flex;align-items:center;gap:.45rem;
  font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
}
.hero .stat .dot{width:.42rem;height:.42rem;border-radius:50%;background:#0f8a55;flex:none}

/* tiles ---------------------------------------------------------------- */
/* auto-fit so a short catalog fills its row instead of leaving an empty track,
   and a width cap from the real tile count (--n) so one or two tiles don't
   stretch into billboards. Above four tiles the cap exceeds the wrap and the
   grid simply goes full width. */
.grid{
  --gap:1rem;--n:4;
  list-style:none;margin:0;padding:0;display:grid;gap:var(--gap);
  grid-template-columns:repeat(auto-fit,minmax(15.5rem,1fr));
  max-width:calc(var(--n) * 24rem + (var(--n) - 1) * var(--gap));
}
.tile{
  position:relative;display:flex;flex-direction:column;gap:.55rem;overflow:hidden;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:1.15rem 1.15rem 1rem;min-height:10.5rem;
  box-shadow:0 1px 2px rgba(20,23,28,.05);
  transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;
}
.tile::before{
  content:"";position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,hsl(var(--h),68%,46%),hsl(var(--h),78%,63%));
}
.tile:hover{
  transform:translateY(-2px);border-color:hsl(var(--h),45%,80%);
  box-shadow:0 12px 24px -14px rgba(20,23,28,.35),0 2px 6px -3px rgba(20,23,28,.10);
}
.tile:focus-within{border-color:var(--accent)}
.tile .head{display:flex;align-items:center;gap:.65rem}
.tile-mark{
  display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:2.05rem;height:2.05rem;border-radius:.62rem;font-size:.92rem;font-weight:800;
  background:hsl(var(--h),70%,95%);color:hsl(var(--h),62%,29%);border:1px solid hsl(var(--h),58%,85%);
}
.tile h2{margin:0;font-size:1.02rem;line-height:1.28;font-weight:700;letter-spacing:-.012em}
.tile h2 a{color:var(--ink);text-decoration:none}
/* the whole tile is the click target for the primary link */
.tile h2 a::after{content:"";position:absolute;inset:0;border-radius:var(--r)}
.tile:hover h2 a{color:hsl(var(--h),64%,32%)}
.tile .need{margin:0;flex:1;color:var(--ink-soft);font-size:.9rem;line-height:1.5}
.tile .foot{margin:.1rem 0 0;display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap}
.details{position:relative;z-index:1;font-size:.82rem;color:var(--muted);text-decoration:none;border-bottom:1px solid var(--line-strong)}
.details:hover{color:var(--accent);border-color:var(--accent)}
.tile.muted{background:#f0f1f4;border-color:#dfe2e7;box-shadow:none}
.tile.muted h2 a{color:var(--ink-soft)}
.tile.muted .need{color:var(--muted)}
/* declared next builds: not links, and they must not look like one */
.tile.soon{background:rgba(255,255,255,.45);border-style:dashed;border-color:var(--line-strong);box-shadow:none}
.tile.soon::before{display:none}
.tile.soon:hover{transform:none;box-shadow:none;border-color:var(--line-strong)}
.tile.soon h2{color:var(--ink-soft);font-weight:600}
.tile.soon .need{color:var(--muted)}
.tile.soon .tile-mark{background:#e9ebef;color:#4f5561;border-color:#d6d9e0}

.chip{
  display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.07em;line-height:1.4;
  text-transform:uppercase;padding:.18rem .5rem;border-radius:999px;
  background:#eef0f3;color:#545b66;border:1px solid #e0e3e9;white-space:nowrap;
}
.chip.live{background:hsl(var(--h),72%,95%);color:hsl(var(--h),64%,28%);border-color:hsl(var(--h),58%,85%)}
.chip.wip{background:#fff4e3;color:#855000;border-color:#f0dcba}
.chip.broken{background:#fdecec;color:#a1232b;border-color:#f2cbcb}
.chip.soon{background:#eceef2;color:#4f5561;border-color:#dbdee5}

/* buttons -------------------------------------------------------------- */
.btn{
  display:inline-block;background:var(--accent);color:#fff;text-decoration:none;
  font-weight:600;font-size:.95rem;padding:.62rem 1.15rem;border-radius:10px;
  box-shadow:0 1px 2px rgba(15,62,163,.25);
}
.btn:hover{background:var(--accent-dark);color:#fff}
.btn.ghost{background:var(--card);color:var(--accent);border:1px solid var(--accent-line);box-shadow:none}
.btn.ghost:hover{background:var(--accent-soft);color:var(--accent-dark)}
.hint{font-size:.88rem;color:var(--muted)}

/* cards for text pages -------------------------------------------------- */
.card{
  position:relative;overflow:hidden;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r);padding:1.25rem;box-shadow:0 1px 2px rgba(20,23,28,.05);
}
.card.app::before{
  content:"";position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,hsl(var(--h),68%,46%),hsl(var(--h),78%,63%));
}
.crumb{margin:0 0 .85rem;font-size:.86rem}
.crumb a{color:var(--muted);text-decoration:none}
.crumb a:hover{color:var(--accent)}
h1{font-size:1.5rem;line-height:1.2;margin:0 0 .4rem;font-weight:800;letter-spacing:-.022em}
.subtitle{margin:0 0 1rem;color:var(--ink-soft);font-size:1rem;line-height:1.55}
.subtitle + .subtitle{margin-top:-.5rem}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0 0 1.1rem;font-size:.86rem;color:var(--muted)}
.actions{margin:0;display:flex;flex-wrap:wrap;gap:.6rem .9rem;align-items:center}
section{margin:1.5rem 0 0;padding-top:1.35rem;border-top:1px solid var(--line)}
section h2{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 .55rem;font-weight:700}
section p{margin:0 0 .55rem;color:var(--ink-soft);font-size:.95rem;line-height:1.6}
section p:last-child{margin-bottom:0}
ul.list{margin:0;padding-left:1.2rem;color:var(--ink-soft);font-size:.93rem;line-height:1.6}
ul.list li{margin:0 0 .4rem}
ul.list li:last-child{margin-bottom:0}
ul.plain{list-style:none;margin:0;padding:0;font-size:.93rem;line-height:1.6}
ul.plain li{margin:0 0 .45rem;color:var(--ink-soft)}
ul.plain li:last-child{margin-bottom:0}
ul.plain a{overflow-wrap:anywhere}
ul.plain .note{color:var(--muted);font-size:.87rem}
pre{
  margin:0 0 .55rem;padding:.75rem .9rem;background:#f5f6f8;border:1px solid var(--line);
  border-radius:10px;overflow-x:auto;font-family:var(--mono);font-size:.85rem;
  line-height:1.55;color:var(--ink-soft);
}
.dates{font-size:.84rem;color:var(--muted);margin:1.35rem 0 0}

/* footer --------------------------------------------------------------- */
footer{border-top:1px solid var(--line);background:var(--card);padding:1.15rem 0;font-size:.85rem;color:var(--muted)}
footer p{margin:0}
footer a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--line-strong)}
footer a:hover{color:var(--accent);border-color:var(--accent)}

@media (min-width:48rem){
  body{font-size:17px}
  .wrap{padding:0 1.75rem}
  .page{padding-top:2.1rem;padding-bottom:3.25rem}
  .hero .wrap{padding-top:2.35rem;padding-bottom:2.2rem}
  .hero .brand{font-size:2.6rem}
  .grid{--gap:1.15rem}
  h1{font-size:1.8rem}
  .card{padding:1.85rem}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** The wordmark: plain editorial serif, no mark. The favicon carries the V. */
function brandBlock(isHome) {
  const tag = isHome ? 'h1' : 'p';
  return `      <${tag} class="brand"><a href="${u('/')}">Voyeur</a></${tag}>`;
}

function layout(opts) {
  const canonical = SITE_URL && opts.canonicalPath ? SITE_URL + opts.canonicalPath : '';
  const wrapClass = opts.wide ? 'wrap page' : 'wrap narrow page';
  const hero = opts.hero || null;
  const heroLines =
    hero && hero.stat
      ? `    <p class="stat"><span class="dot" aria-hidden="true"></span>${esc(hero.stat)}</p>\n`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${FAVICON}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="website">
<meta name="robots" content="${opts.noindex ? 'noindex' : 'index,follow'}">
<style>${CSS}</style>
</head>
<body>
<header class="top${hero ? ' hero' : ''}">
  <div class="wrap">
    <div class="bar">
${brandBlock(Boolean(hero))}
      <nav class="nav"><a href="${u('/about/')}">About</a><span aria-hidden="true">&middot;</span><a href="${REPO_URL}">GitHub</a></nav>
    </div>
${heroLines}  </div>
</header>
<main>
  <div class="${wrapClass}">
${opts.body}
  </div>
</main>
<footer>
  <div class="wrap">
    <p>MIT &middot; <a href="${REPO_URL}">GitHub</a> &middot; <a href="${u('/about/')}">About</a></p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

function chip(status) {
  const meta = STATUSES[status] || STATUSES.wip;
  return `<span class="chip ${esc(status)}">${esc(meta.label)}</span>`;
}

function detailPath(app) {
  return u('/apps/' + app.slug + '/');
}

/**
 * One tile. The whole tile is a click target for the primary link, via a
 * stretched ::after on the title anchor — no nested <a>, no JavaScript.
 * Working apps point straight at the app. Broken/retired ones point at the
 * detail page instead of a link we know is dead.
 */
function renderTile(app) {
  const usable = app.liveUrl && (app.status === 'live' || app.status === 'wip');
  const href = usable ? app.liveUrl : detailPath(app);
  const rel = usable && app.status !== 'live' ? ' rel="nofollow"' : '';
  const muted = app.status === 'broken' || app.status === 'retired' ? ' muted' : '';

  const parts = [];
  parts.push(`      <li class="tile${muted}" style="--h:${hueFor(app.slug)}">`);
  parts.push('        <div class="head">');
  parts.push(`          <span class="tile-mark" aria-hidden="true">${esc(initialOf(app.name))}</span>`);
  parts.push(`          <h2><a href="${esc(href)}"${rel}>${esc(app.name)}</a></h2>`);
  parts.push('        </div>');
  parts.push(`        <p class="need">${esc(app.need)}</p>`);
  parts.push('        <p class="foot">');
  parts.push('          ' + chip(app.status));
  if (usable) {
    parts.push(`          <a class="details" href="${esc(detailPath(app))}">Details</a>`);
  }
  parts.push('        </p>');
  parts.push('      </li>');
  return parts.join('\n');
}

/**
 * An "In the works" tile: a build the pipeline has declared, not an app. It has
 * no link at all — nothing here is clickable, because there is nothing to open.
 */
function renderComingTile(item) {
  return [
    '      <li class="tile soon">',
    '        <div class="head">',
    `          <span class="tile-mark" aria-hidden="true">${esc(initialOf(item.title))}</span>`,
    `          <h2>${esc(item.title)}</h2>`,
    '        </div>',
    `        <p class="need">${esc(item.need)}</p>`,
    '        <p class="foot"><span class="chip soon">In the works</span></p>',
    '      </li>',
  ].join('\n');
}

function emptyState() {
  return `    <div class="card">
      <p>No apps yet — the first ones are being built.</p>
      <p class="actions"><a class="btn" href="${REPO_URL}">Follow along on GitHub</a></p>
    </div>`;
}

/**
 * The one-line count under the tagline. Counts only what is really there; if
 * there is nothing to count it says nothing.
 */
function statLine(apps, coming) {
  const live = apps.filter((a) => a.status === 'live').length;
  const building = apps.filter((a) => a.status === 'wip').length + coming.length;
  const parts = [];
  if (live > 0) parts.push(live + ' live tool' + (live === 1 ? '' : 's'));
  if (building > 0) parts.push(building + ' in build');
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function renderIndex(apps, coming) {
  const tiles = apps.map(renderTile).concat(coming.map(renderComingTile));
  const body =
    tiles.length === 0
      ? emptyState()
      : `    <ul class="grid" style="--n:${Math.min(tiles.length, 4)}">
${tiles.join('\n')}
    </ul>`;

  return layout({
    title: 'Voyeur — free fashion tools',
    description:
      'A catalog of small, free fashion tools. Built autonomously. No accounts, no fees.',
    canonicalPath: '/',
    wide: tiles.length > 0, // a one-line empty state doesn't need the full grid width
    hero: { stat: statLine(apps, coming) },
    body: body,
  });
}

function renderAppPage(app) {
  const meta = STATUSES[app.status] || STATUSES.wip;
  const created = formatDate(app.created);
  const updated = formatDate(app.updated);
  const sourceUrl = REPO_TREE + '/apps/' + encodeURIComponent(app.dirName);

  const parts = [];
  parts.push(`    <p class="crumb"><a href="${u('/')}">&larr; All apps</a></p>`);
  parts.push(`    <article class="card app" style="--h:${hueFor(app.slug)}">`);
  parts.push(`      <h1>${esc(app.name)}</h1>`);
  parts.push(`      <p class="subtitle">${esc(app.need)}</p>`);
  parts.push('      <p class="meta">' + chip(app.status) + (meta.note ? ` <span>${esc(meta.note)}</span>` : '') + '</p>');

  parts.push('      <p class="actions">');
  if (app.liveUrl && app.status === 'broken') {
    parts.push(`        <a class="btn ghost" href="${esc(app.liveUrl)}" rel="nofollow">Open it anyway</a>`);
  } else if (app.liveUrl && app.status !== 'retired') {
    const rel = app.status === 'live' ? '' : ' rel="nofollow"';
    parts.push(`        <a class="btn" href="${esc(app.liveUrl)}"${rel}>Open the app</a>`);
  } else {
    parts.push('        <span class="hint">No live link. The source is below.</span>');
  }
  parts.push('      </p>');

  if (app.description) {
    parts.push('      <section>');
    parts.push('        <h2>What it does</h2>');
    parts.push(`        <p>${esc(app.description)}</p>`);
    parts.push('      </section>');
  }

  // Required by docs/PRINCIPLES.md: every app states what it can't do.
  parts.push('      <section>');
  parts.push('        <h2>Limitations</h2>');
  if (app.limitations.length > 0) {
    parts.push('        <ul class="list">');
    for (const l of app.limitations) parts.push(`          <li>${esc(l)}</li>`);
    parts.push('        </ul>');
  } else {
    parts.push('        <p>Not declared. Treat that as a gap in the record, not a clean bill of health.</p>');
  }
  parts.push('      </section>');

  if (app.evidence.length > 0) {
    parts.push('      <section>');
    parts.push('        <h2>Who asked</h2>');
    parts.push('        <ul class="plain">');
    for (const e of app.evidence) {
      if (e.href) {
        parts.push(
          `          <li><a href="${esc(e.href)}" rel="nofollow noopener">${esc(e.text)}</a>` +
            (e.note ? ` <span class="note">${esc(e.note)}</span>` : '') +
            '</li>'
        );
      } else {
        parts.push(`          <li>${esc(e.text)}</li>`);
      }
    }
    parts.push('        </ul>');
    parts.push('      </section>');
  }

  parts.push('      <section>');
  parts.push('        <h2>Run locally</h2>');
  if (app.localRun) parts.push(`        <pre><code>${esc(app.localRun)}</code></pre>`);
  parts.push(`        <p><a href="${esc(sourceUrl)}">Source on GitHub</a></p>`);
  parts.push('      </section>');

  const facts = [];
  if (created) facts.push(`Built <time datetime="${esc(app.created)}">${esc(created)}</time>`);
  if (updated) facts.push(`updated <time datetime="${esc(app.updated)}">${esc(updated)}</time>`);
  facts.push(esc(app.license));
  parts.push(`      <p class="dates">${facts.join(' &middot; ')}</p>`);
  parts.push('    </article>');

  const desc = app.description || app.need;

  return layout({
    title: app.name + ' — Voyeur',
    description: desc.length > 300 ? desc.slice(0, 297) + '…' : desc,
    canonicalPath: '/apps/' + app.slug + '/',
    body: parts.join('\n'),
  });
}

function renderAbout() {
  const body = `    <div class="card">
      <h1>About</h1>
      <p class="subtitle">Voyeur is a catalog of small, free fashion tools. Every app runs in your browser &mdash; no accounts, no fees, no tracking.</p>
      <p class="subtitle">An autonomous Claude Code pipeline runs the whole thing: it finds the need, builds the app, tries to break it, and ships it. No human writes the code or approves the deploys.</p>

      <section>
        <h2>One cycle</h2>
        <ul class="list">
          <li><b>Scout</b> &mdash; read public threads for fashion problems people wish had software.</li>
          <li><b>Select</b> &mdash; pick at most one. Zero is a normal answer.</li>
          <li><b>Research</b> &mdash; find the simplest implementation that is free to run forever.</li>
          <li><b>Plan</b> &mdash; split it into modules with fixed interfaces.</li>
          <li><b>Build</b> &mdash; parallel agents, one per module.</li>
          <li><b>Adversarial loop</b> &mdash; reviewers, breakers and simulated first-time users, until it holds.</li>
          <li><b>Deploy</b> &mdash; ship it, then drive the live URL on a phone viewport to prove it works.</li>
          <li><b>Record</b> &mdash; write the run log, commit, push.</li>
        </ul>
      </section>

      <section>
        <h2>Honesty</h2>
        <p>Every app lists its limitations; broken apps are labeled broken.</p>
      </section>

      <section>
        <h2>The record</h2>
        <ul class="plain">
          <li><a href="${REPO_TREE}/pipeline/state/runs">Run logs</a> &mdash; one per cycle, including the failures.</li>
          <li><a href="${REPO_TREE}/docs">Docs</a> &mdash; the principles and the pipeline.</li>
          <li><a href="${REPO_URL}">Repository</a> &mdash; every app, MIT licensed.</li>
        </ul>
      </section>
    </div>`;

  return layout({
    title: 'About — Voyeur',
    description:
      'Voyeur is a catalog of small, free fashion tools built by an autonomous pipeline. How a cycle works, and where to read the logs.',
    canonicalPath: '/about/',
    body: body,
  });
}

function render404() {
  const body = `    <div class="card">
      <h1>Not found</h1>
      <p class="subtitle">That page isn&#39;t here.</p>
      <p class="actions"><a class="btn" href="${u('/')}">See the catalog</a></p>
    </div>`;
  return layout({
    title: 'Not found — Voyeur',
    description: 'That page is not here. Browse the Voyeur catalog instead.',
    canonicalPath: '',
    noindex: true,
    body: body,
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeFile(relPath, contents) {
  const full = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf8');
  return full;
}

function build() {
  const started = Date.now();
  console.log('Voyeur catalog build');
  console.log('  repo root:  ' + REPO_ROOT);
  console.log('  output:     ' + OUT_DIR);

  const apps = loadManifests();
  const coming = loadComing();

  // Fresh dist every time — a stale page for a deleted app is a dead link.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const written = [];
  written.push(writeFile('index.html', renderIndex(apps, coming)));
  written.push(writeFile('about/index.html', renderAbout()));
  written.push(writeFile('404.html', render404()));

  for (const app of apps) {
    written.push(writeFile(path.join('apps', app.slug, 'index.html'), renderAppPage(app)));
    // Ship the app itself alongside its catalog page: apps/<slug>/app/ serves
    // the app directory verbatim. Static apps only — that's the architecture.
    try {
      fs.cpSync(path.join(APPS_DIR, app.dirName), path.join(OUT_DIR, 'apps', app.slug, 'app'), {
        recursive: true,
      });
    } catch (err) {
      warn('apps/' + app.dirName + '/ could not be copied into dist (' + err.message + ')');
    }
  }

  written.push(writeFile('robots.txt', robotsTxt()));
  if (SITE_URL) written.push(writeFile('sitemap.xml', sitemapXml(apps)));

  const byStatus = {};
  for (const app of apps) byStatus[app.status] = (byStatus[app.status] || 0) + 1;
  const statusLine = Object.keys(byStatus)
    .sort()
    .map((k) => byStatus[k] + ' ' + k)
    .join(', ');

  console.log('');
  console.log('  apps:       ' + apps.length + (statusLine ? ' (' + statusLine + ')' : ' — empty catalog'));
  console.log('  in works:   ' + coming.length);
  console.log('  pages:      ' + written.length);
  console.log('  warnings:   ' + warnings.length);
  if (!SITE_URL) console.log('  note:       SITE_URL unset — no canonical links or sitemap.xml');
  console.log('  built in ' + (Date.now() - started) + 'ms');

  if (warnings.length > 0) {
    console.log('');
    console.log('  ' + warnings.length + ' manifest warning(s):');
    for (const w of warnings) console.log('    - ' + w);
    if (STRICT) {
      console.error('\n  --strict: failing because of the warnings above.');
      process.exit(1);
    }
  }
}

function robotsTxt() {
  let out = 'User-agent: *\nAllow: /\n';
  if (SITE_URL) out += '\nSitemap: ' + SITE_URL + '/sitemap.xml\n';
  return out;
}

function sitemapXml(apps) {
  const urls = ['/', '/about/'].concat(
    apps.flatMap((a) => ['/apps/' + a.slug + '/', '/apps/' + a.slug + '/app/'])
  );
  const body = urls
    .map((u) => '  <url><loc>' + esc(SITE_URL + u) + '</loc></url>')
    .join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
}

try {
  build();
} catch (err) {
  console.error('\nBUILD FAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
}
