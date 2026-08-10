# Rejected

Ideas considered and declined — **always with reasoning.** This file exists so future scouts don't spend a cycle re-litigating a settled question. An entry without a reason is worthless; an entry with one can save four hours.

Read this before proposing anything. You may override a rejection — conditions change, a paid API goes free, a model gets small enough — but say in your run log what changed and why the old reasoning no longer holds.

Record the rejection reason, not just the fact. "Needs a paid API" is useful. "Not a good fit" is not.

Format: **idea** — *rejected YYYY-MM-DD* — reason · what would change this

---

**Luxury-bag / designer-item authentication tool** — *rejected 2026-08-09* — Strong recurring pain
(years of PurseForum threads distrusting both cheap services and established apps like LegitApp,
which misjudged a fake and refused a refund). But reliable authentication requires expert visual
judgment or serious trained models; a zero-cost client-side app would be exactly the unreliable
tool users already complain about, and a wrong "authentic" verdict causes real financial harm.
· What would change this: a genuinely reliable open model for authentication verification —
unlikely; treat this rejection as near-permanent.

**Resale marketplace price/payout tools** — *rejected 2026-08-09* — Complaints are about platform
economics (ThredUp payouts, Depop filters), not a missing tool; a real comp-pricing tool needs
live marketplace data (ongoing scraping infra, ToS-sensitive, breaks silently). Adjacent seller
tools (Closo, VintHelper, Nifty) already crowd the space. · What would change this: an official
free marketplace API with historical pricing.

**Live cross-marketplace search/API for discontinued-item finding** — *rejected 2026-08-10* —
Researched as part of the owner-directed discontinued-item-search priority. eBay's keyless
Finding API was decommissioned Feb 2025; its replacement (Browse API) requires OAuth + a
registered developer key and blocks direct browser calls via CORS, so it needs a server holding
a shared key — that key gets rate-limited across all users almost immediately at any real scale,
which is exactly the "rate-limit users to protect a budget" failure PRINCIPLES forbids. Etsy
requires an API key on every request. Poshmark, Depop and Vinted have no public API at all
(Vinted's is partner-allowlist only). A live "search my discontinued item across marketplaces"
engine cannot be built zero-cost, keyless, and client-side with today's marketplace APIs. ·
What would change this: any of the major resale marketplaces shipping a free, keyless,
CORS-enabled public search endpoint. The buildable substitute — a static guided-search-link
generator plus the free FTC RN-database lookup, no live API needed — is in backlog.

**Client-side visual dupe/closest-match index for discontinued items (CLIP-embedding search)** —
*rejected 2026-08-10* — The model side is genuinely free (transformers.js / ONNX Runtime Web
runs CLIP-family models fully client-side, confirmed working demos exist). The blocker is the
index: a useful index needs thousands of rights-clear fashion photos, and the standard large
fashion corpora (DeepFashion/DeepFashion2) are academic-license only, not MIT-compatible, so they
can't be bundled. There is no free bulk source of rights-clear discontinued-fashion photography
to build a real index from — this is a curation-supply problem, not an engineering one. ·
What would change this: a large (thousands+) rights-clear/MIT-compatible fashion image corpus
appearing, or a scoped version limited to images the user supplies themselves rather than a
bundled index.
