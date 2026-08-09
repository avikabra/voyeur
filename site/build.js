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
 *   SITE_URL   absolute origin (e.g. https://voyeur.example). When set, canonical
 *              links and a sitemap.xml are emitted. Omitted when unset — a wrong
 *              canonical URL is worse than none.
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
const TAGLINE = 'Free fashion tools, built by an autonomous AI. No accounts. No fees. Ever.';

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
  wip: {
    label: 'In progress',
    note: 'Still being built. It may be incomplete or change without warning.',
  },
  broken: {
    label: 'Broken',
    note: 'This app is currently broken. It is listed anyway — a dead link you discover yourself is worse than an admission you read first.',
  },
  retired: {
    label: 'Retired',
    note: 'Retired. The need went away, or something it depended on did. The source stays up.',
  },
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
    warn(where + ' is marked "live" but has no usable liveUrl — the card will say so');
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
// Styles — inlined into every page. No external assets, no fonts, no JS.
// ---------------------------------------------------------------------------

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#faf8f5;
  --panel:#f3efe9;
  --ink:#17140f;
  --ink-soft:#3f382f;
  --muted:#6f665b;
  --rule:#ddd5c9;
  --rule-strong:#c6bcac;
  --accent:#9a3d18;
  --serif:ui-serif,Georgia,"Iowan Old Style","Times New Roman",Times,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#100f0e;
    --panel:#1a1817;
    --ink:#f4efe8;
    --ink-soft:#d5cdc2;
    --muted:#9a9084;
    --rule:#2e2a26;
    --rule-strong:#463f38;
    --accent:#e08a5f;
  }
}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;
  background:var(--bg);
  color:var(--ink);
  font-family:var(--sans);
  font-size:17px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:.18em}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
img{max-width:100%;height:auto}
hr{border:0;border-top:1px solid var(--rule);margin:2.5rem 0}

/* masthead ------------------------------------------------------------- */
.masthead{border-bottom:1px solid var(--rule);padding:1.75rem 0 1.5rem}
.wordmark{
  display:inline-block;
  font-family:var(--serif);
  font-size:1.4rem;
  font-weight:600;
  letter-spacing:.26em;
  text-transform:uppercase;
  color:var(--ink);
  text-decoration:none;
  margin:0 0 .35rem;
}
.wordmark:hover{color:var(--accent)}
.tagline{margin:0;color:var(--muted);font-size:.95rem;line-height:1.5;max-width:32rem}
.masthead nav{margin-top:1rem;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase}
.masthead nav a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--rule-strong);padding-bottom:2px}
.masthead nav a:hover{color:var(--accent);border-color:var(--accent)}
.masthead nav span{color:var(--rule-strong);padding:0 .5rem}

main{padding:2.5rem 0 3rem}

/* shared type ---------------------------------------------------------- */
.eyebrow{
  font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;
  color:var(--muted);margin:0 0 .75rem;font-weight:600;
}
.lede{font-family:var(--serif);font-size:1.25rem;line-height:1.45;color:var(--ink-soft);margin:0 0 1.25rem}
.count{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 2rem}

/* catalog cards -------------------------------------------------------- */
.catalog{list-style:none;margin:0;padding:0}
.card{border-top:1px solid var(--rule);padding:2rem 0}
.card:first-child{border-top:0;padding-top:0}
.card-need{font-family:var(--serif);font-weight:600;font-size:1.5rem;line-height:1.25;margin:0 0 .6rem;letter-spacing:-.01em}
.card-need a{color:var(--ink);text-decoration:none}
.card-need a:hover{color:var(--accent)}
.card-meta{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;margin:0 0 .75rem;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.card-meta .appname{color:var(--ink-soft);font-weight:600}
.card p.desc{margin:0 0 1.1rem;color:var(--ink-soft)}
.card-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.25rem;margin:0}
.card.dim{opacity:.68}
.card.dim:hover,.card.dim:focus-within{opacity:1}
.status-note{margin:0 0 1rem;font-size:.9rem;color:var(--muted);border-left:2px solid var(--rule-strong);padding-left:.85rem}

.badge{
  display:inline-flex;align-items:center;gap:.4rem;
  font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600;
  border:1px solid var(--rule-strong);border-radius:999px;padding:.15rem .6rem;color:var(--muted);
}
.badge::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.badge.live{color:var(--accent);border-color:var(--accent)}

.use{
  display:inline-block;font-weight:600;font-size:.95rem;
  border:1px solid var(--accent);border-radius:2px;
  padding:.5rem 1.05rem;text-decoration:none;color:var(--accent);
}
.use:hover{background:var(--accent);color:var(--bg)}
.secondary{font-size:.9rem;color:var(--muted);text-decoration:none;border-bottom:1px solid var(--rule-strong);padding-bottom:2px}
.secondary:hover{color:var(--accent);border-color:var(--accent)}
.hint{font-size:.9rem;color:var(--muted)}

/* empty state ---------------------------------------------------------- */
.empty h1{font-family:var(--serif);font-size:1.85rem;line-height:1.2;margin:0 0 1.1rem;letter-spacing:-.015em;font-weight:600}
.empty p{margin:0 0 1.1rem;color:var(--ink-soft)}
.scouting{list-style:none;margin:1.5rem 0 2rem;padding:0;border-top:1px solid var(--rule)}
.scouting li{border-bottom:1px solid var(--rule);padding:.7rem 0;font-family:var(--serif);font-size:1.02rem;color:var(--ink-soft)}
.cta-row{display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;align-items:center;margin:0}

/* app detail ----------------------------------------------------------- */
.crumb{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;margin:0 0 1.5rem}
.crumb a{color:var(--muted);text-decoration:none}
.crumb a:hover{color:var(--accent)}
h1.need{font-family:var(--serif);font-size:1.9rem;line-height:1.2;letter-spacing:-.015em;margin:0 0 .9rem;font-weight:600}
.detail-meta{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;margin:0 0 1.5rem;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.detail-meta .appname{color:var(--ink-soft);font-weight:600}
.hero-actions{margin:0 0 2.25rem;display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;align-items:center}
section{margin:0 0 2.25rem}
section h2{font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 .85rem;font-weight:600}
section p{margin:0 0 1rem;color:var(--ink-soft)}
.limits{border:1px solid var(--rule-strong);padding:1.25rem 1.25rem .5rem;background:var(--panel)}
.limits h2{margin-bottom:.75rem;color:var(--ink-soft)}
.limits ul{margin:0 0 .75rem;padding-left:1.1rem}
.limits li{margin:0 0 .55rem;color:var(--ink-soft)}
.evidence{list-style:none;margin:0;padding:0}
.evidence li{border-top:1px solid var(--rule);padding:.7rem 0;font-size:.95rem}
.evidence li:first-child{border-top:0;padding-top:0}
.evidence .note{display:block;color:var(--muted);font-size:.88rem;margin-top:.2rem}
pre{
  margin:0 0 1rem;padding:.85rem 1rem;background:var(--panel);
  border:1px solid var(--rule);overflow-x:auto;
  font-family:var(--mono);font-size:.85rem;line-height:1.5;color:var(--ink-soft);
}
.tags{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;margin:0;padding:0}
.tags li{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);border:1px solid var(--rule);padding:.2rem .55rem;border-radius:2px}
dl.facts{margin:0;font-size:.9rem}
dl.facts div{display:flex;gap:1rem;border-top:1px solid var(--rule);padding:.6rem 0}
dl.facts div:first-child{border-top:0}
dl.facts dt{margin:0;color:var(--muted);flex:0 0 8.5rem;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;padding-top:.15rem}
dl.facts dd{margin:0;color:var(--ink-soft)}

/* prose (about, 404) --------------------------------------------------- */
.prose h1{font-family:var(--serif);font-size:1.9rem;line-height:1.2;letter-spacing:-.015em;margin:0 0 1rem;font-weight:600}
.prose h2{font-family:var(--serif);font-size:1.2rem;letter-spacing:0;text-transform:none;color:var(--ink);margin:2.5rem 0 .85rem;font-weight:600}
.prose p{margin:0 0 1.1rem;color:var(--ink-soft)}
.prose ul{margin:0 0 1.1rem;padding-left:1.1rem;color:var(--ink-soft)}
.prose li{margin:0 0 .55rem}
.prose .steps{list-style:none;padding:0;counter-reset:step}
.prose .steps li{counter-increment:step;border-top:1px solid var(--rule);padding:.9rem 0 .9rem 2.25rem;position:relative;margin:0}
.prose .steps li::before{
  content:counter(step);position:absolute;left:0;top:.95rem;
  font-size:.72rem;letter-spacing:.1em;color:var(--muted);font-variant-numeric:tabular-nums;
}
.prose .steps b{display:block;color:var(--ink);font-weight:600}

/* footer --------------------------------------------------------------- */
footer{border-top:1px solid var(--rule);padding:1.75rem 0 3rem;font-size:.82rem;color:var(--muted)}
footer p{margin:0 0 .45rem}
footer a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--rule-strong)}
footer a:hover{color:var(--accent);border-color:var(--accent)}

@media (min-width:40rem){
  body{font-size:18px}
  .wrap{padding:0 2rem}
  .masthead{padding:2.5rem 0 2rem}
  .wordmark{font-size:1.7rem}
  main{padding:3.5rem 0 4rem}
  .card-need{font-size:1.85rem}
  h1.need,.empty h1,.prose h1{font-size:2.4rem}
  .lede{font-size:1.4rem}
  .card{padding:2.5rem 0}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layout(opts) {
  const canonical = SITE_URL && opts.canonicalPath ? SITE_URL + opts.canonicalPath : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="color-scheme" content="light dark">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="website">
<meta name="robots" content="index,follow">
<style>${CSS}</style>
</head>
<body>
<header class="masthead">
  <div class="wrap">
    <a class="wordmark" href="${u('/')}">Voyeur</a>
    <p class="tagline">${esc(TAGLINE)}</p>
    <nav>
      <a href="${u('/')}">Catalog</a><span>/</span><a href="${u('/about/')}">How this works</a><span>/</span><a href="${REPO_URL}">Source</a>
    </nav>
  </div>
</header>
<main>
  <div class="wrap">
${opts.body}
  </div>
</main>
<footer>
  <div class="wrap">
    <p>Every app here was found, built, tested and shipped by an autonomous AI pipeline. No human writes the code, picks the ideas, or approves the deploys.</p>
    <p>MIT licensed &middot; <a href="${REPO_URL}">Source on GitHub</a> &middot; <a href="${u('/about/')}">How this works</a></p>
    <p>No accounts, no tracking, no third-party scripts.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

function badge(status) {
  const meta = STATUSES[status] || STATUSES.wip;
  return `<span class="badge ${esc(status)}">${esc(meta.label)}</span>`;
}

function useLink(app, label) {
  if (!app.liveUrl) return '';
  const text = label || 'Use it &rarr;';
  const rel = app.status === 'live' ? '' : ' rel="nofollow"';
  return `<a class="use" href="${esc(app.liveUrl)}"${rel}>${text}</a>`;
}

function renderCard(app) {
  const meta = STATUSES[app.status] || STATUSES.wip;
  const dim = app.status === 'broken' || app.status === 'retired' ? ' dim' : '';
  const created = formatDate(app.created);

  const parts = [];
  parts.push(`      <li class="card${dim}">`);
  parts.push(
    `        <h2 class="card-need"><a href="${u('/apps/' + esc(app.slug) + '/')}">${esc(app.need)}</a></h2>`
  );
  parts.push('        <p class="card-meta">');
  parts.push(`          <span class="appname">${esc(app.name)}</span>`);
  parts.push('          ' + badge(app.status));
  if (created) parts.push(`          <time datetime="${esc(app.created)}">${esc(created)}</time>`);
  parts.push('        </p>');

  if (meta.note) parts.push(`        <p class="status-note">${esc(meta.note)}</p>`);
  if (app.description) parts.push(`        <p class="desc">${esc(app.description)}</p>`);

  parts.push('        <p class="card-actions">');
  if (app.liveUrl && app.status === 'broken') {
    // Don't hand someone a big button to a thing we know is broken.
    parts.push(
      `          <a class="secondary" href="${esc(app.liveUrl)}" rel="nofollow">Open it anyway &rarr;</a>`
    );
  } else if (app.liveUrl && app.status !== 'retired') {
    parts.push('          ' + useLink(app));
  } else if (!app.liveUrl && app.status === 'live') {
    parts.push('          <span class="hint">No live link on file yet</span>');
  }
  parts.push(`          <a class="secondary" href="${u('/apps/' + esc(app.slug) + '/')}">What it does &amp; what it can&#39;t</a>`);
  parts.push('        </p>');
  parts.push('      </li>');
  return parts.join('\n');
}

function emptyState() {
  return `    <section class="empty">
      <p class="eyebrow">The catalog is empty</p>
      <h1>Nothing here yet. The first apps are being built right now.</h1>
      <p>Voyeur is a library of small, free fashion tools &mdash; the things a spreadsheet can&#39;t solve. What size am I in a brand I&#39;ve never bought from. What is this coat actually costing me per wear. Is that resale price good. Where did the discontinued one go.</p>
      <p>Every tool in it is found, researched, built, broken, fixed and shipped by an autonomous pipeline. No human writes the code, picks the ideas, or approves the deploys. A cycle that ships nothing is a normal cycle &mdash; an empty shelf is cheaper than a shelf of filler. So this page fills slowly, and everything that lands on it works.</p>
      <p class="eyebrow" style="margin-top:2rem">What it is scouting for</p>
      <ul class="scouting">
        <li>Your size in a brand you have never bought from</li>
        <li>What a garment really costs you, per wear</li>
        <li>Whether a resale price is a good one</li>
        <li>Where a discontinued piece went</li>
      </ul>
      <p class="cta-row">
        <a class="use" href="${u('/about/')}">How this works &rarr;</a>
        <a class="secondary" href="${REPO_URL}">Watch it happen on GitHub</a>
      </p>
    </section>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function renderIndex(apps) {
  let body;
  if (apps.length === 0) {
    body = emptyState();
  } else {
    const liveCount = apps.filter((a) => a.status === 'live').length;
    const count =
      apps.length +
      (apps.length === 1 ? ' app' : ' apps') +
      (liveCount === apps.length ? '' : ' · ' + liveCount + ' live');
    body = `    <p class="count">${esc(count)} &middot; newest first</p>
    <ul class="catalog">
${apps.map(renderCard).join('\n')}
    </ul>`;
  }

  return layout({
    title: 'Voyeur — free fashion tools, built by an autonomous AI',
    description:
      'A catalog of small, free fashion tools — sizing, wardrobe, resale, discontinued pieces. Every one found, built, tested and shipped by an autonomous AI pipeline. No accounts, no fees.',
    canonicalPath: '/',
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
  parts.push('    <article>');
  parts.push(`      <h1 class="need">${esc(app.need)}</h1>`);
  parts.push('      <p class="detail-meta">');
  parts.push(`        <span class="appname">${esc(app.name)}</span>`);
  parts.push('        ' + badge(app.status));
  parts.push('      </p>');

  if (meta.note) parts.push(`      <p class="status-note">${esc(meta.note)}</p>`);

  parts.push('      <p class="hero-actions">');
  if (app.liveUrl && app.status === 'broken') {
    parts.push(
      `        <a class="secondary" href="${esc(app.liveUrl)}" rel="nofollow">Open it anyway &rarr;</a>`
    );
    parts.push('        <span class="hint">It is known to be broken. Expect it not to work.</span>');
  } else if (app.liveUrl && app.status !== 'retired') {
    parts.push('        ' + useLink(app));
    parts.push('        <span class="hint">Free, no account, works on a phone</span>');
  } else if (app.status === 'retired') {
    parts.push('        <span class="hint">This app is retired. The source is still here.</span>');
  } else {
    parts.push('        <span class="hint">No live link yet &mdash; the source is below.</span>');
  }
  parts.push('      </p>');

  if (app.description) {
    parts.push('      <section>');
    parts.push('        <h2>What it does</h2>');
    parts.push(`        <p>${esc(app.description)}</p>`);
    parts.push('      </section>');
  }

  // Limitations sit high on the page on purpose. See docs/PRINCIPLES.md.
  parts.push('      <section class="limits">');
  parts.push('        <h2>What it can&#39;t do</h2>');
  if (app.limitations.length > 0) {
    parts.push('        <ul>');
    for (const l of app.limitations) parts.push(`          <li>${esc(l)}</li>`);
    parts.push('        </ul>');
  } else {
    parts.push(
      '        <p>This app has not declared its limitations. Every app has them, so treat that as a gap in the record rather than a clean bill of health.</p>'
    );
  }
  parts.push('      </section>');

  if (app.evidence.length > 0) {
    parts.push('      <section>');
    parts.push('        <h2>Who asked for this</h2>');
    parts.push('        <ul class="evidence">');
    for (const e of app.evidence) {
      if (e.href) {
        parts.push(
          `          <li><a href="${esc(e.href)}" rel="nofollow noopener">${esc(e.text)}</a>` +
            (e.note ? `<span class="note">${esc(e.note)}</span>` : '') +
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
  parts.push('        <h2>Run it yourself</h2>');
  if (app.localRun) {
    parts.push(`        <pre><code>${esc(app.localRun)}</code></pre>`);
    parts.push(
      '        <p>Clone the repo and run that. Everything happens in your browser, so you can run it with the network off and check that nothing leaves your machine.</p>'
    );
  } else {
    parts.push(
      '        <p>No local-run command on file. The source is below &mdash; most of these are static and run with any local web server.</p>'
    );
  }
  parts.push(`        <p><a class="secondary" href="${esc(sourceUrl)}">Source on GitHub &rarr;</a></p>`);
  parts.push('      </section>');

  parts.push('      <section>');
  parts.push('        <h2>Details</h2>');
  parts.push('        <dl class="facts">');
  parts.push(`          <div><dt>Status</dt><dd>${esc(meta.label)}</dd></div>`);
  if (created) parts.push(`          <div><dt>Built</dt><dd><time datetime="${esc(app.created)}">${esc(created)}</time></dd></div>`);
  if (updated) parts.push(`          <div><dt>Updated</dt><dd><time datetime="${esc(app.updated)}">${esc(updated)}</time></dd></div>`);
  parts.push(`          <div><dt>Cost</dt><dd>Free, forever. No account, no key, no limits.</dd></div>`);
  parts.push(`          <div><dt>License</dt><dd>${esc(app.license)}</dd></div>`);
  parts.push('        </dl>');
  parts.push('      </section>');

  if (app.tech.length > 0) {
    parts.push('      <section>');
    parts.push('        <h2>Built with</h2>');
    parts.push('        <ul class="tags">');
    for (const t of app.tech) parts.push(`          <li>${esc(t)}</li>`);
    parts.push('        </ul>');
    parts.push('      </section>');
  }

  parts.push('    </article>');

  const desc =
    (app.description || app.need) +
    ' Free, no account. Built and shipped by an autonomous AI pipeline.';

  return layout({
    title: app.name + ' — ' + app.need + ' | Voyeur',
    description: desc.length > 300 ? desc.slice(0, 297) + '…' : desc,
    canonicalPath: '/apps/' + app.slug + '/',
    body: parts.join('\n'),
  });
}

function renderAbout() {
  const body = `    <div class="prose">
      <p class="eyebrow">How this works</p>
      <h1>Nobody is writing these apps.</h1>
      <p class="lede">Voyeur is a library of small fashion tools that an AI finds the need for, builds, tries to break, fixes, and ships &mdash; with no human in the loop at any step.</p>

      <p>Every few hours a fresh Claude Code session wakes up in <a href="${REPO_URL}">this repository</a> with no memory of the last one. It reads the docs, reads the state files the previous sessions left behind, and runs one cycle. Then it commits, pushes, and dies. Nothing carries over except what it wrote down.</p>

      <h2>One cycle</h2>
      <ol class="steps">
        <li><b>Scout</b> Mine public conversation &mdash; forums, app-store reviews, comment threads &mdash; for fashion problems people say they wish had software. It reads the replies, not just the wish: &ldquo;does this exist?&rdquo; answered with a link is a solved problem. Answered with silence is a lead. It also re-checks apps already on the shelf; a broken one outranks any new idea.</li>
        <li><b>Select</b> Reduce the candidates to exactly one, weighing how many independent people asked, whether one session can finish it, and whether it can be run for free forever. Zero is a valid answer, and it is the usual answer.</li>
        <li><b>Research</b> Find the simplest complete implementation that uses the best technique currently available &mdash; and check every dependency&#39;s license and cost. If the research shows the app can&#39;t meet the constraints, it dies here, with the reasoning written down so a future session doesn&#39;t spend the same hours.</li>
        <li><b>Plan</b> Decompose the build into modules with exact interfaces, so several agents can work at once without colliding.</li>
        <li><b>Build</b> Launch parallel implementation agents, one per module, and integrate between waves.</li>
        <li><b>Adversarial loop</b> Turn three kinds of adversary loose on the real build at the same time: code reviewers hunting correctness, license and accidental-cost problems; breakers feeding it empty inputs, 40MB photos, a photo of a dog, a dead network, a 375px screen; and simulated first-time users driving the actual running app with no instructions, to see where they give up. An orchestrator triages, fixes, and runs the loop again. Two or three rounds is normal. A clean first round means the adversaries were too gentle.</li>
        <li><b>Deploy</b> Ship it, then prove it shipped &mdash; drive the live URL end to end, on a mobile viewport, before calling it live.</li>
        <li><b>Record</b> Write the run log, update the state files, commit, push. The log is the only channel that exists; there is nobody to notify.</li>
      </ol>

      <p>If the orchestrator isn&#39;t genuinely satisfied at step six, nothing ships. A cycle that ships nothing is a successful cycle. The catalog&#39;s value is its hit rate, not its length &mdash; an empty week is cheap, a bad app is permanent.</p>

      <h2>The honesty stance</h2>
      <p>An autonomous system that markets itself is dangerous, so this one is built to undersell instead.</p>
      <ul>
        <li><b>Every app lists what it can&#39;t do</b>, on its own page, above the fold rather than buried at the bottom. An empty limitations list is treated as a gap in the record, not a clean bill of health.</li>
        <li><b>Accuracy is stated plainly, including when it&#39;s poor.</b> &ldquo;Rough estimate, &plusmn;3cm, calibrate with a known object&rdquo; is a usable tool. &ldquo;Precise measurements from a photo&rdquo; is a lie, and you would find out in one try.</li>
        <li><b>Broken apps are labelled broken</b> and stay in the catalog, dimmed, with a note. A dead link you discover yourself is worse than an admission you read first.</li>
        <li><b>Retired apps say so</b> and keep their source and their run log.</li>
      </ul>

      <h2>What it costs, and why that matters</h2>
      <p>Nothing, at any scale, forever. No paid APIs, no keys, no databases, no metered inference, no per-user fees &mdash; and no rate limits, because rate-limiting users to protect a budget is just a bill in disguise. Apps run in your browser: your photos and your measurements stay on your device, which you can verify by running an app locally with the network switched off.</p>
      <p>There is no monetisation at all. No ads, no affiliate links, no email capture, no analytics that identify anyone, no third-party scripts. That is not modesty &mdash; a system with no human supervision cannot be trusted with a revenue incentive, and a zero-cost system is one that can keep running unattended without a bill arriving for nobody to pay.</p>

      <h2>Read the record</h2>
      <p>All of it is public, including the failures.</p>
      <ul>
        <li><a href="${REPO_TREE}/pipeline/state/runs">Run logs</a> &mdash; one per cycle: what was scouted, what was rejected and why, what the adversarial agents caught, how many rounds it took.</li>
        <li><a href="${REPO_TREE}/pipeline/state">State files</a> &mdash; the backlog, what shipped, and what was declined with the reasoning.</li>
        <li><a href="${REPO_TREE}/docs">The docs</a> &mdash; the principles, the pipeline and the constraints each session reads before it does anything.</li>
        <li><a href="${REPO_URL}">The repository</a> &mdash; every app, MIT licensed, and the commit history of a machine building them.</li>
      </ul>
    </div>`;

  return layout({
    title: 'How this works — Voyeur',
    description:
      'How Voyeur builds itself: an autonomous pipeline scouts public demand, researches, builds with parallel agents, runs an adversarial loop until an orchestrator is satisfied, then deploys. Every few hours, no human involved.',
    canonicalPath: '/about/',
    body: body,
  });
}

function render404() {
  const body = `    <div class="prose">
      <p class="eyebrow">404</p>
      <h1>That page isn&#39;t here.</h1>
      <p>It may have been retired, or it may never have existed. The catalog is the reliable list.</p>
      <p class="cta-row">
        <a class="use" href="${u('/')}">See the catalog &rarr;</a>
        <a class="secondary" href="${u('/about/')}">How this works</a>
      </p>
    </div>`;
  return layout({
    title: 'Not found — Voyeur',
    description: 'That page is not here. Browse the Voyeur catalog of free fashion tools instead.',
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
