# Size Decoder for Vinted

**What Vinted's S/M/L buckets mean for your actual UK size.**

One HTML file. No dependencies, no build step, no network requests once the page has loaded.

---

## What it does

On 10 November 2025 Vinted collapsed UK womenswear numeric sizes into letter buckets with ranges — `S / UK 8–10`, `M / UK 12–14` — and auto-converted every existing listing. Filter for your size and the bucket hands you the other sizes in it too; sellers can only list a bucket.

- **Buying** — pick your usual UK size: your bucket, which boxes to tick (yours plus the adjacent one it leaks into), and the pre-November label.
- **Selling** — pick the garment's UK size: the bucket to list under, what to write, and a copy-ready description snippet.
- **Reference tables** — the full reported mapping in plain HTML that works with JavaScript switched off.

## What it can't do

- **UK womenswear tops, dresses and outerwear only.** Jeans, trousers and shoes appear to have kept numeric sizing — inferred from the absence of complaints, not from Vinted documentation. No menswear, no kids', no other countries.
- **It can't fix Vinted's filters.** It helps you work around them; you still tick two buckets and scroll.
- **It may describe a system Vinted has already changed.** An unconfirmed partial reversion to numeric sizes around January 2026, and a per-account "sizing standard" picker reported rolling out around July 2026 — two people can see different labels on the same listing. The page says so, and leads with advice that survives every version: tick the adjacent bucket, ask for measurements.
- **No EU or US column.** Vinted-specific mappings couldn't be verified and generic conversions are disputed.
- **Not affiliated with Vinted.**

## How it works

A single `index.html`: inline CSS, inline vanilla JS, no external assets. Six bucket objects (letter, UK range) plus an object of old single-size labels. Picking a size looks up the bucket, works out whether the size sits at the bottom or top of its range, and names the neighbouring bucket on that side — the one auto-converted and guessed-at listings leak into.

The picker is progressive enhancement: the main script's first statement adds a `js` class to `<html>`, deliberately inside that same script, so if it fails to parse the class is never set and the tables stay visible instead of a dead picker. `localStorage` is wrapped in try/catch. The copy button uses a hidden textarea and `document.execCommand`, falling back to the async clipboard API, then to telling you to select the text.

## Run it locally

```
npx serve apps/vinted-size-decoder
```

Or open `index.html` directly — one file, no origin requirements.

## Data provenance

**Compiled from user threads on Mumsnet and press reporting of the November 2025 change** (ChannelX, Glossy, Yorkshire Post syndication) — **not from official Vinted documentation**. Snapshot dated 9 August 2026.

| Data point | Confidence |
| --- | --- |
| New: S = UK 8–10, M = UK 12–14, L = UK 16–18, XXL = UK 24–26 | High — corroborated across user threads and press reports |
| New: XL = UK 20–22 | Moderate–high |
| New: XS = UK 4–6 | Moderate |
| Old: S/8, M/10, L/12, XL/14, XXL/16 | High |
| Old: XS ≈ 6 | Least certain data point on the page |

Deliberately **not** included, because it could not be verified: any bucket below XS or above XXL; EU or US equivalents; kids' sizing; menswear; per-country differences. Jeans/trousers/shoes keeping numeric sizing is an **inference from the absence of complaints**, and the page phrases it that way.

MIT licensed.
