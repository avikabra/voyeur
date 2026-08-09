# Architecture

## Repo layout

Monorepo, no build tooling at the root, no shared dependency graph. Apps are islands on purpose.

```
voyeur/
├── apps/
│   └── <slug>/              # one self-contained app per directory
│       ├── manifest.json    # catalog metadata — the contract
│       ├── README.md        # what it does, limits, how to run locally
│       └── ...              # whatever this app needs. No constraints.
├── site/                    # the catalog site (its own Vercel project)
├── docs/                    # these documents
└── pipeline/
    └── state/               # memory between sessions
        ├── backlog.md
        ├── shipped.md
        ├── rejected.md
        └── runs/            # YYYY-MM-DD-HHMM.md per run
```

**Self-contained means self-contained.** No shared component library, no root `package.json` hoisting, no cross-app imports. If two apps need the same size-chart data, each gets its own copy. The cost of duplication is trivial; the cost of a shared dependency breaking six apps at once, with no human to notice, is not. Deleting `apps/<slug>/` must fully remove an app.

## Per-app anatomy

### manifest.json — the contract

The catalog site reads every `apps/*/manifest.json` at build time. This is the only interface between an app and the site. Get it right and the app appears correctly; there is no other registration step.

```json
{
  "slug": "size-translator",
  "name": "Size Translator",
  "need": "Figure out your size in a brand you've never bought from.",
  "description": "Longer paragraph for the app's catalog page.",
  "limitations": [
    "Covers 40 brands, mostly US and EU womenswear.",
    "Size charts are manufacturer-published and often optimistic."
  ],
  "evidence": [
    "https://reddit.com/r/femalefashionadvice/comments/... — 200+ comments, no tool named",
    "https://reddit.com/r/PlusSize/comments/... — same want, different words"
  ],
  "status": "live",
  "liveUrl": "https://voyeur-size-translator.vercel.app",
  "created": "2026-08-12",
  "updated": "2026-08-12",
  "tech": ["static", "vanilla-js", "no-build"],
  "localRun": "npx serve apps/size-translator",
  "license": "MIT"
}
```

Field notes:

- **`need`** — one sentence, in the user's words, phrased as their problem. This is the catalog headline. "Figure out your size in a brand you've never bought from," not "cross-brand sizing normalization engine."
- **`evidence`** — links to the public posts that justified building it, with a one-line note on what each shows. Non-negotiable: an app with no evidence should not have been built. This is also what makes the catalog credible about being demand-driven.
- **`status`** — `live` | `broken` | `retired` | `wip`. A session that finds an app broken sets `broken` immediately, even if it can't fix it that run. The catalog renders broken apps honestly rather than hiding them; a dead link is worse than an admission.
- **`limitations`** — required, non-empty. Every app has them. See PRINCIPLES on honesty.
- **`localRun`** — the literal command. Usually `npx serve apps/<slug>`.

Extend the schema if an app genuinely needs a field. Add it to this doc in the same commit, and make the site tolerate its absence in older manifests.

### README.md

Per-app, human-readable: what it does, what it doesn't, how it works in two paragraphs, how to run it locally, and known limitations. Written for a curious user, not a maintainer.

## Static-first

**Client-side compute is the default. A serverless function requires justification recorded in the run log.**

This is not aesthetic preference — it's how the zero-cost invariant survives contact with traffic. Static assets on Vercel's CDN cost effectively nothing and cannot be rate-limited into failure. A function invoked per user action scales its cost with popularity, which is exactly the failure mode we cannot afford, since nobody is paying the bill and nobody is watching the dashboard.

Practical consequences:

- Data ships as static JSON in the bundle. A curated 200KB size-chart file loaded once beats any API.
- ML runs in the browser — ONNX Runtime Web, TensorFlow.js, MediaPipe. Model weights are static assets. Cache them.
- User data lives in localStorage / IndexedDB. No database. No accounts.
- Shareable state goes in the URL (query string or hash), not a server.

Legitimate reasons for a serverless function: a third-party API that forbids browser calls via CORS, or something genuinely impossible client-side. Then it must be cacheable, cheap, and it must degrade gracefully — the app should still do something useful when the function is unavailable, because eventually it will be.

## Deployment model

**GitHub Pages, one static site for everything** (decided 2026-08-09 during the pilot, superseding
the original Vercel plan — see below for why):

- The whole library lives at **https://avikabra.github.io/voyeur/** — the catalog at the root,
  each app served verbatim at `/apps/<slug>/app/`, its catalog page beside it at `/apps/<slug>/`.
- `site/build.js` builds everything (`SITE_URL=https://avikabra.github.io/voyeur BASE_PATH=/voyeur`),
  and the result is published by force-pushing `site/dist` to the **`gh-pages` branch**, which Pages
  serves. Two equivalent paths: push to `main` and let `.github/workflows/pages.yml` do it, or
  build locally and force-push `gh-pages` yourself. Verify ships via the GitHub Actions API — the
  auto "pages build and deployment" run must succeed.
- Failure isolation comes from the build script, not project separation: a malformed app or
  manifest is skipped with a warning, never sinking the catalog.
- Pages is free with soft limits (~1GB site, ~100GB/month bandwidth) — keep assets lean.

**Why not Vercel** (as of Aug 2026 — re-check if the owner changes connector settings): the
claude.ai Vercel connector is project-scoped to the owner's pre-existing projects. It can
sometimes create a new project's deployment but can never read, verify, or manage it — and an
unverifiable deploy is treated as a failed deploy. If the owner grants the connector full project
access, Vercel per-app projects become viable again; until then, don't attempt it.

## Tech freedom

**Each session picks its own stack, per app.** Vanilla JS and no build step is often the right answer for a small tool and shouldn't feel like a downgrade. React, Svelte, Astro, Next — all fine when they earn it. Do not standardize; do not build a house framework. The next session is smart and should not be constrained by this one's taste.

The hard rules, and there are only five:

1. **Self-contained.** No dependencies on other apps in this repo.
2. **Zero-cost to run.** No paid services, no keys, no metered anything.
3. **No signup wall.** The app works fully on first load, for an anonymous user.
4. **MIT licensed.** Including transitively — check that a model or dataset you're bundling actually permits it. Several good VTON models are CC BY-NC-SA and therefore unusable here.
5. **Works on a mobile browser.** Most fashion problems happen while standing in a store or looking at a closet. Test at 375px width. If it needs a mouse or a desktop viewport, it's broken.

## Local-use path

Every app states how to run it locally, in its README and in `manifest.localRun`. For static apps that's `npx serve apps/<slug>`. If it needs a build, the command must work from a clean clone with nothing but Node installed — no environment variables, no `.env` file, no setup steps. If it can't, simplify the app until it can.

## The catalog site

`site/` is a Vercel project that reads the manifests at build time and renders, following the OpenAlternative pattern from RESEARCH:

- **Home:** every app, sorted by recency, each showing its `need` line and a direct link that opens the live app.
- **Per-app page:** the full manifest — description, limitations, evidence links, live URL, source link, local-run instructions.
- **Per-need pages** where several apps address one problem area. These are the pages that rank in search; that's the whole reason the two-tier structure exists.
- **An "how this was built" page.** The provenance is a genuine differentiator — link to the run logs and let people read what the adversarial agents actually caught.

The site is itself a Voyeur app and follows the same rules: static, fast, no tracking, works on a phone.
