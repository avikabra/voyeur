# Backlog

Unbuilt ideas. **A queue, not a mandate** — a candidate from fresh scouting with live evidence beats anything here. Prune aggressively; a stale backlog is worse than an empty one.

Every entry below is seeded from founding research (Aug 2026), which means **none of them carry current demand evidence**. Before building one, scout for fresh signal to confirm people still want it. If the signal isn't there, delete the entry.

Format: **need** — why it's a gap · feasibility · evidence status

---

## Owner-directed priorities (2026-08-09) — build these first

1. **Virtual try-on, free and in the browser** — **IN BUILD as of 2026-08-10, see
   `runs/2026-08-10-*.md`.** Re-scouted 2026-08-10: photoreal try-on is still confirmed
   infeasible zero-cost — no MIT/Apache-licensed browser-executable garment-transfer model
   exists (Mobile-VTON, DCI-VTON, IDM-VTON, OOTDiffusion, CatVTON all CC BY-NC-SA or GPU-bound;
   even Google killed its standalone Doppl app in favor of a metered server-side model). The
   feasible, differentiated path: a **non-photoreal pose-guided garment overlay** — MediaPipe
   Pose Landmarker (Apache 2.0, vendored WASM+model, works via WebGPU on iOS Safari as of 2026)
   detects body landmarks on a user's own selfie; the user also supplies a photo of the garment
   (something they're considering buying, screenshotted from a shop) and roughly crops it;
   a canvas-based piecewise-affine/mesh warp maps the garment onto the torso region keyed to
   shoulder/hip/waist landmarks, rendered as an honestly-labeled stylized/semi-transparent
   overlay, not a seamless composite. This sidesteps the two things that make photoreal try-on
   hard (fabric physics, occlusion) by never claiming to solve them, and sidesteps the
   licensing trap that killed the discontinued-item visual index below, because no bundled
   garment dataset is needed — both photos are user-supplied and processed 100% client-side,
   never uploaded anywhere. Demand: ~90% of Mumsnet-described online-clothing returns are
   fit/style driven; 2026 coverage cites only ~1.4% of adults using try-on regularly because
   people assume it needs an app/account (direct validation for a no-signup browser tool);
   every current "free" competitor (Magic Hour, WearMind) rate-limits because their generation
   costs real money — nobody has a zero-marginal-cost version. Multi-session build expected;
   if this session doesn't finish, check runs/ for the handoff state before starting fresh.
2. **Discontinued-item search** — refined 2026-08-10. Live cross-marketplace search and a
   bundled visual-dupe index are both **ruled out** (see rejected.md 2026-08-10 entries: no
   free keyless marketplace API exists post eBay-Finding-API shutdown; no rights-clear bulk
   fashion image corpus exists to build a dupe index from). The buildable, honest version:
   a **guided search-link generator** — user enters what they know (brand, style name/code,
   era, category, color); the tool builds correct pre-filled search URLs for eBay, Poshmark,
   Depop, Vinted, Google Shopping, and Wayback Machine snapshot lookups via plain URL
   construction (no API, no key), plus surfaces the free public FTC RN-database
   (ftc.gov/rn-database/search, no key/login) to identify a manufacturer from a garment tag's
   RN number. Add a localStorage watchlist so a user can save items and re-check later —
   that's what pushes it past "a chat reply could do this." Demand is real but diffuse across
   many small threads rather than one loud community (PurseForum, Quora, r/findfashion,
   r/HelpMeFind); strongest signal is a paid app ("Copped: AI Outfit Finder", 2025) already
   doing the aggregated version behind a subscription — proves willingness to use this, and
   the free/no-signup niche is open. Scoped enough to likely ship in one session; strong next
   pick after try-on reaches a shippable state or if try-on's build stalls.

## With live demand evidence (from 2026-08-09 pilot scout)

- **Petite-friendly brand directory** — 6 Mumsnet threads across years rebuild the same brand list from scratch (Boden, Hobbs, Uniqlo XXS...); no canonical filterable resource exists. · Static curated directory with filters; the lift is data curation and keeping it honest about coverage. · *Evidence: mumsnet.com/talk/style_and_beauty/5535865, /5162311, /5024803, /4990977, /5295041, /4789233.*
- **Wear-tracking / cost-per-wear without the paywall** — Indyx paywalls analytics (~$20 AUD/mo), Acloset caps free tier at 100 items with heavy ads and locked users out of their own catalogs (€30/mo); YouLookFab users still hand-roll spreadsheets. Differentiator: local-only (IndexedDB), no cap, no account, data exportable. · Trivial compute; the risk is manual-entry friction. · *Evidence: youlookfab.com/welookfab/topic/app-for-tracking-cost-per-wears (+3 sibling threads), justuseapp.com Indyx reviews, kimola.com Acloset report.*
- **International size conversion (menswear suits/jackets)** — 4-5 Styleforum threads re-derive EU↔US conversion manually over years; conversions are disputed between sources ("2 schools of thought"), which a good tool would surface rather than hide. · Pure static lookup; must present the disagreement honestly. · *Evidence: styleforum.net threads 528800, 361698, 717209.*

## From founding research (Aug 2026) — no live evidence yet

1. **Cross-brand size/fit reconciliation** — "I'm a US 8 in J.Crew, what am I in Uniqlo?" True Fit and MySize solve this but are B2B-only, licensed to retailers, never sold to shoppers. Largest identified gap. · Pure logic over a curated static size-chart JSON, no ML; the entire lift is data curation quality and honest confidence signaling. · *From founding research, needs fresh demand evidence.*

2. **Discontinued-item / dupe finder** — no unified tool exists; people do this by hand with RN numbers, style codes, and Wayback on dead product pages. · CLIP-embedding similarity over a curated index, in-browser ONNX; the index is the hard part. · *From founding research, needs fresh demand evidence.*

3. **Resale price tracker for saved items** — watchlist plus price history for specific items you're waiting on. · Needs a zero-cost data path — check official free marketplace APIs first; if it needs a key, it's disqualified. · *From founding research, needs fresh demand evidence.*

4. **Capsule wardrobe generator** — the paid apps (Cladwell, Capsule App) charge for this. · Rules engine plus client-side background removal (rembg/U2Net via WASM). Differentiate on generation, not cataloging — cataloging is OSS-saturated. · *From founding research, needs fresh demand evidence.*

5. **Color analysis** — trivial and flooded with free clones; near-zero novelty. · Easy. Listed only as a viable end-to-end smoke test if a first build needs to be boring. Do not ship this as app #2. · *From founding research, low value regardless of evidence.*

6. **Garment measurement from a flat-lay photo** — measure a shirt on a table against a reference object for scale; solves "will this thrift find fit me." · Client-side CV, needs a scale reference and careful accuracy claims. · *From founding research, needs fresh demand evidence.*

7. **Body measurement estimation from a selfie** — MediaPipe BlazePose landmarks. · Feasible client-side; **calibration (pixels → centimeters) is the hard part** and the accuracy claim must be stated conservatively or the app is dishonest. · *From founding research, needs fresh demand evidence.*

8. **Cost-per-wear closet analytics** — not another wardrobe app; the analytics layer the wardrobe apps charge for. · Trivial compute, localStorage only. Risk is requiring too much manual data entry to be worth it. · *From founding research, needs fresh demand evidence.*

9. **Silhouette try-on** — honest low-fidelity garment overlay on pose landmarks. The underserved middle between "nothing" and GPU photorealism; being visibly a silhouette is the feature, not a shortcoming. · MediaPipe + canvas, fully client-side. · *From founding research, needs fresh demand evidence.*

10. **Universal secondhand search** — one query across marketplaces. · Only viable via official free-tier APIs (eBay, Etsy) — **verify whether they now require registration or a key; if so, disqualified.** Gem and Beni already do this well on affiliate revenue. · *From founding research, needs fresh demand evidence.*

---

**Out of scope until conditions change:** photorealistic virtual try-on. IDM-VTON / OOTDiffusion / CatVTON all require GPU inference (and IDM-VTON is CC BY-NC-SA, incompatible with MIT). Breaks the zero-cost invariant. Revisit when a browser-executable (WebGPU) garment-transfer model with a permissive license exists — that's the trigger condition.
