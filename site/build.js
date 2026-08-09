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
const TAGLINE = 'Free fashion tools, built autonomously. No accounts, no fees.';

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
  --bg:#f7f7f8;
  --card:#ffffff;
  --ink:#15171c;
  --ink-soft:#3d434b;
  --muted:#6c727c;
  --line:#e3e5ea;
  --line-strong:#cdd1d8;
  --accent:#1550d0;
  --accent-dark:#0f3ea3;
  --accent-soft:#eaf0fd;
  --accent-line:#c7d8fa;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
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
}
.wrap{max-width:68rem;margin:0 auto;padding:0 1rem}
.wrap.narrow{max-width:42rem}
a{color:var(--accent);text-underline-offset:.15em}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
img{max-width:100%;height:auto}

/* header --------------------------------------------------------------- */
.top{background:var(--card);border-bottom:1px solid var(--line)}
.top .wrap{padding-top:1.15rem;padding-bottom:1.15rem}
.wordmark{display:inline-block;font-size:1.15rem;font-weight:700;letter-spacing:.01em;color:var(--ink);text-decoration:none}
.wordmark:hover{color:var(--accent)}
.tagline{margin:.25rem 0 0;color:var(--muted);font-size:.9rem}
.top nav{margin-top:.55rem;font-size:.85rem;color:var(--line-strong)}
.top nav a{color:var(--muted);text-decoration:none}
.top nav a:hover{color:var(--accent)}
.top nav span{padding:0 .35rem}

main{padding:1.5rem 0 2.5rem}

/* tiles ---------------------------------------------------------------- */
.grid{list-style:none;margin:0;padding:0;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))}
.tile{
  position:relative;display:flex;flex-direction:column;gap:.45rem;
  background:var(--card);border:1px solid var(--line);border-radius:10px;
  padding:1rem;min-height:9rem;
}
.tile:hover{border-color:var(--accent-line);box-shadow:0 1px 3px rgba(20,23,28,.07)}
.tile:focus-within{border-color:var(--accent)}
.tile h2{margin:0;font-size:1rem;line-height:1.3;font-weight:600}
.tile h2 a{color:var(--ink);text-decoration:none}
/* the whole tile is the click target for the primary link */
.tile h2 a::after{content:"";position:absolute;inset:0;border-radius:10px}
.tile .need{margin:0;flex:1;color:var(--ink-soft);font-size:.9rem}
.tile .foot{margin:0;display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap}
.details{position:relative;z-index:1;font-size:.82rem;color:var(--muted);text-decoration:none;border-bottom:1px solid var(--line-strong)}
.details:hover{color:var(--accent);border-color:var(--accent)}
.tile.muted{background:#fbfbfc}
.tile.muted h2 a{color:var(--ink-soft)}

.chip{
  display:inline-block;font-size:.67rem;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;padding:.15rem .45rem;border-radius:999px;
  background:#eef0f3;color:var(--muted);border:1px solid var(--line);white-space:nowrap;
}
.chip.live{background:var(--accent-soft);color:var(--accent);border-color:var(--accent-line)}

/* buttons -------------------------------------------------------------- */
.btn{
  display:inline-block;background:var(--accent);color:#fff;text-decoration:none;
  font-weight:600;font-size:.95rem;padding:.6rem 1.1rem;border-radius:8px;
}
.btn:hover{background:var(--accent-dark)}
.btn.ghost{background:var(--card);color:var(--accent);border:1px solid var(--accent-line)}
.btn.ghost:hover{background:var(--accent-soft)}
.hint{font-size:.88rem;color:var(--muted)}

/* cards for text pages -------------------------------------------------- */
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1.25rem}
.crumb{margin:0 0 .85rem;font-size:.85rem}
.crumb a{color:var(--muted);text-decoration:none}
.crumb a:hover{color:var(--accent)}
h1{font-size:1.4rem;line-height:1.25;margin:0 0 .35rem;font-weight:700;letter-spacing:-.01em}
.subtitle{margin:0 0 .9rem;color:var(--ink-soft)}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0 0 1rem;font-size:.85rem;color:var(--muted)}
.actions{margin:0 0 .35rem;display:flex;flex-wrap:wrap;gap:.6rem .9rem;align-items:center}
section{margin:1.5rem 0 0}
section h2{font-size:.7rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 .45rem;font-weight:700}
section p{margin:0 0 .5rem;color:var(--ink-soft);font-size:.95rem}
section p:last-child{margin-bottom:0}
ul.list{margin:0;padding-left:1.15rem;color:var(--ink-soft);font-size:.93rem}
ul.list li{margin:0 0 .35rem}
ul.plain{list-style:none;margin:0;padding:0;font-size:.93rem}
ul.plain li{margin:0 0 .4rem;color:var(--ink-soft)}
ul.plain .note{color:var(--muted);font-size:.87rem}
pre{
  margin:0 0 .5rem;padding:.7rem .85rem;background:#f5f6f8;border:1px solid var(--line);
  border-radius:8px;overflow-x:auto;font-family:var(--mono);font-size:.85rem;
  line-height:1.5;color:var(--ink-soft);
}
.dates{font-size:.85rem;color:var(--muted);margin:1.25rem 0 0}

/* footer --------------------------------------------------------------- */
footer{border-top:1px solid var(--line);background:var(--card);padding:1.1rem 0;font-size:.85rem;color:var(--muted)}
footer p{margin:0}
footer a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--line-strong)}
footer a:hover{color:var(--accent);border-color:var(--accent)}

@media (min-width:48rem){
  body{font-size:17px}
  .wrap{padding:0 1.5rem}
  main{padding:2rem 0 3rem}
  h1{font-size:1.65rem}
  .card{padding:1.75rem}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layout(opts) {
  const canonical = SITE_URL && opts.canonicalPath ? SITE_URL + opts.canonicalPath : '';
  const wrapClass = opts.wide ? 'wrap' : 'wrap narrow';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="color-scheme" content="light">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="website">
<meta name="robots" content="index,follow">
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="wordmark" href="${u('/')}">Voyeur</a>
    <p class="tagline">${esc(TAGLINE)}</p>
    <nav><a href="${u('/about/')}">About</a><span>&middot;</span><a href="${REPO_URL}">GitHub</a></nav>
  </div>
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
  parts.push(`      <li class="tile${muted}">`);
  parts.push(`        <h2><a href="${esc(href)}"${rel}>${esc(app.name)}</a></h2>`);
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

function emptyState() {
  return `    <div class="card">
      <p>No apps yet — the first ones are being built.</p>
      <p class="actions"><a class="btn" href="${REPO_URL}">Follow along on GitHub</a></p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function renderIndex(apps) {
  const body =
    apps.length === 0
      ? emptyState()
      : `    <ul class="grid">
${apps.map(renderTile).join('\n')}
    </ul>`;

  return layout({
    title: 'Voyeur — free fashion tools',
    description:
      'A catalog of small, free fashion tools. Built autonomously. No accounts, no fees.',
    canonicalPath: '/',
    wide: true,
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
  parts.push('    <article class="card">');
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

  // Fresh dist every time — a stale page for a deleted app is a dead link.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const written = [];
  written.push(writeFile('index.html', renderIndex(apps)));
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
