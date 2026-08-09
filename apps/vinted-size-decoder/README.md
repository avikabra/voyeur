# Vinted Size Decoder

**Work out what Vinted's S/M/L buckets mean for your actual UK size — and how to actually find your size on there.**

One HTML file. No dependencies, no build step, no network requests once the page has loaded.

---

## What it does

On 10 November 2025 Vinted collapsed UK womenswear numeric sizes into letter buckets with ranges — `S / UK 8–10`, `M / UK 12–14`, and so on — and auto-converted every existing listing. The result, as reported across a year of forum threads: ticking "14" in the filter returns 12s and mislabelled 10s; sellers can only list a bucket, so buyers message to ask what the garment actually is; anyone between two sizes has to tick several boxes and scroll.

This page:

- **Buying mode** — pick your usual UK size and it tells you which bucket you're in under the documented system, which boxes to tick (your bucket *plus* the adjacent one, with the reasoning for that specific neighbour), what your size was labelled before November 2025 so you can read older listings, and a measurement-first checklist.
- **Selling mode** — pick the garment's UK size and it tells you which bucket to list under, exactly what to write so buyers on any version of Vinted's UI can find you, and a copy-ready description snippet with the numeric size and measurement placeholders.
- **Reference tables** — the full documented mapping, new ranges next to the old pre-November single-size labels, date-stamped, in plain HTML that works with JavaScript switched off.

## What it can't do

- **It only covers UK womenswear tops, dresses and outerwear.** Jeans, trousers and shoes appear to have kept numeric sizing; that is inferred from nobody complaining about them, not from Vinted documentation. No menswear, no kids', no other countries.
- **It can't fix Vinted's filters.** Nothing client-side can. It helps you work around them — you will still tick two buckets and scroll past sizes you don't want.
- **It may be describing a system Vinted has already changed.** Vinted has churned this repeatedly: an unconfirmed partial reversion to numeric sizes around January 2026, and a per-account "sizing standard" picker reported rolling out around July 2026. Two people can be looking at the same listing and see different labels. The page says so, prominently, and the advice that survives all versions — tick the adjacent bucket, ask for measurements — is the advice it leads with.
- **No EU or US column.** Vinted-specific mappings for these buckets could not be verified and generic conversions are disputed. A wrong column would be worse than no column.
- **Not affiliated with Vinted.**

## How it works

The whole thing is a single `index.html`: inline CSS, inline vanilla JavaScript, no external assets of any kind. The size mapping is a small array of six bucket objects (letter, UK range) plus an object for the old single-size labels. Picking a size looks up the bucket, works out whether your size sits at the bottom or the top of its range, and names the neighbouring bucket on that side — that's the one auto-converted and guessed-at listings leak into, so that's the one worth ticking. If the letters moved between the old and new systems for your size (UK 10 was `M`, it is now `S`), it says so, because that's the trap for anyone who ticked letters out of habit.

The interactive picker is progressive enhancement. A one-line script adds a `js` class to `<html>`; without it the picker is hidden, a short note explains why, and the two reference tables — which contain the same mapping, both directions — are plain semantic HTML that reads fine in any browser, in Reader mode, or through a screen reader. The last-picked size and mode are kept in `localStorage`, wrapped in try/catch so a browser with storage disabled or a private window that throws on access degrades to "doesn't remember" rather than a blank page. The copy button uses a hidden textarea and `document.execCommand`, falling back to the async clipboard API, falling back to telling you to select the text yourself. Nothing on the page makes a network request after load.

## Run it locally

```
npx serve apps/vinted-size-decoder
```

Or just open `index.html` in a browser — it's one file with no origin requirements. Turn the network off first if you want to check that nothing leaves your machine.

## Data provenance

The mapping is **encoded from multi-source reporting of Vinted's November 2025 change** — independent user threads describing the same buckets — not from official Vinted documentation. Compiled 9 August 2026. Confidence, stated plainly because it varies:

| Data point | Confidence |
| --- | --- |
| New: S = UK 8–10, M = UK 12–14, L = UK 16–18, XXL = UK 24–26 | High — corroborated across independent reports |
| New: XL = UK 20–22 | Moderate–high |
| New: XS = UK 4–6 | Moderate |
| Old: S/8, M/10, L/12, XL/14, XXL/16 | High |
| Old: XS ≈ 6 | Least certain data point on the page |

Deliberately **not** included, because it could not be verified: any bucket below XS or above XXL; EU or US equivalents for the buckets; kids' sizing; menswear; per-country differences. Jeans/trousers keeping numeric waist sizes and shoes keeping numeric sizing is an **inference from the absence of complaints**, and the page phrases it that way.

The community advice the page encodes — check garment measurements over labels, ask for pit-to-pit and shoulder-to-hem, compare against clothes you own, tick adjacent buckets when between sizes, look for a photo of the size tag — comes from the same threads. It is guidance, not data, and it holds regardless of which version of Vinted's sizing UI you happen to have.

MIT licensed.
