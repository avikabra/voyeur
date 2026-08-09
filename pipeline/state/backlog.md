# Backlog

Unbuilt ideas. **A queue, not a mandate** — a candidate from fresh scouting with live evidence beats anything here. Prune aggressively; a stale backlog is worse than an empty one.

Every entry below is seeded from founding research (Aug 2026), which means **none of them carry current demand evidence**. Before building one, scout for fresh signal to confirm people still want it. If the signal isn't there, delete the entry.

Format: **need** — why it's a gap · feasibility · evidence status

---

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
