# Vision

## The one-sentence version

A public catalog of finished fashion-tech products that an AI found the need for, built, broke, fixed, and shipped — with no human in the loop at any step.

## The precedent we're copying

OpenAlternative.co is a directory of open-source alternatives to paid software. It works because of a structural insight: people don't search for repositories, they search for *a way out of a subscription*. So it organizes around the need ("Best open-source Notion alternatives") and then hands you the product. A million uniques a year later, the format is proven.

We take that format and change two things.

**Vertical.** Fashion consumers, not developers. Sizing, wardrobe, resale, discontinued items, fit, secondhand search. A population that is enormous, underserved by software, and almost entirely locked out of the good tools — because the good sizing and fit tech (True Fit, MySize) is B2B-only, licensed to retailers, and never sold to the person who actually has the problem.

**Provenance.** Nothing here is aggregated. Every listing is a product this system built itself. That combination — an autonomously generated app library — has no precedent we could find. The niche is unclaimed, and it's the part that makes Voyeur interesting beyond its utility.

## Product-first, not repo-first

This is the positioning decision that everything else follows from.

A catalog entry leads with **a link that works**. Click it, the app loads, it does the thing. Below that: what it does, what it can't do, how to run it yourself, and the source. GitHub stars are a developer trust signal and we'll show them, but they are not the headline — a person trying to figure out their size in a Japanese brand does not care about stars.

Concretely, every entry answers, above the fold:
- What problem is this for? (in the user's words, not ours)
- Where do I click to use it right now?
- What does it cost? (nothing, ever, no account)
- What does it *not* do? (stated plainly — see PRINCIPLES)

## Dual-path access

Copied from the strongest pattern in the open-source-app genre: hosted instantly *and* runnable locally. Every Voyeur app must offer both.

- **Hosted:** a live Vercel URL. No signup, no waitlist, no key. Works on a phone browser.
- **Local:** a one-line path to running it yourself — for most of these, `npx serve` in the app directory, because most of them are static. Stated explicitly in the app's README.

The local path matters more than it looks. It's the honesty guarantee: if the app processes your closet photos or body measurements, you can run it with the network off and verify nothing leaves your machine.

## What makes an app belong here

Six tests. An idea has to pass all six. (Owner redirection, 2026-08-09: the first draft of
these tests optimized for small and niche. That was wrong. Aim big.)

1. **Broadly useful.** A problem shared by shoppers everywhere — across countries, platforms,
   and communities — not one forum's workaround. The north-star examples, named by the owner:
   **virtual try-on** and **discontinued-item search**. If the audience is "a specific corner of
   one site," it's backlog material at best.
2. **More than a chat answer.** If one ChatGPT reply could solve it, don't build it. The app
   must do what a chat reply can't: interactive computation, image processing, search over an
   index, persistent local data, a visual result.
3. **Ambitious but shippable.** Build the hardest version the pipeline can actually complete —
   and a build that spans several sessions via the partial-progress handoff in PIPELINE is
   normal, not a failure. Scope down only when the constraint forces it, and say so honestly.
4. **Complete.** "Simplest" is not "minimal." The simplest *complete* implementation solves the
   whole problem using the best available technique. A half-answer burns trust.
5. **Zero-cost to operate.** No paid APIs, no metered inference, no keys that expire. Free-tier
   serverless (within the catalog's Vercel project) is allowed where client-side genuinely can't
   do the job — but costs must never scale with users, and users are never rate-limited.
6. **No signup.** No accounts, no email capture. State lives in the browser or the URL.

On virtual try-on specifically: GPU-hosted photorealism is still out (it breaks #5), but that is
a constraint to engineer around, not a reason to skip the category. Browser-runnable models
(WebGPU, onnxruntime-web), pose-guided compositing, and the model landscape change fast —
re-scout what's possible every cycle and build the best try-on that runs free. A working
constrained try-on beats a perfect one that can't exist here.

## What success looks like

A stranger with a real fashion problem lands on the catalog from a search result, finds the entry that matches their problem, clicks through, and has the problem solved in under a minute — without creating an account, without hitting a paywall, and without ever knowing or caring that no human was involved in making it.

Second-order, in rough priority:
- The catalog is a genuinely useful destination for fashion problems, independent of the AI story.
- The AI story brings people who then find the apps useful.
- The run logs and adversarial transcripts are an honest public record of what autonomous building actually produces — including the failures.

## What failure looks like

Worth naming so it can be recognized early:

- **Filler.** A shelf of twelve color-analysis clones because they were easy. Shipping nothing beats shipping filler — the catalog's value is the hit rate, not the count.
- **Triviality.** One-off lookup tools that a single chat reply replaces, serving a niche
  audience. The pilot's first app skirted this line (owner feedback, 2026-08-09); aim at the
  big shared problems instead.
- **Rot.** Twenty apps, eight of them broken, nobody checking. Maintenance is part of every cycle, not a someday task.
- **Dishonesty.** An app that claims to estimate your measurements to the centimeter and is off by four. Overstatement is the fastest way to make the whole catalog worthless.
- **Drift.** Apps that quietly need a key, an account, a paid tier. The zero-cost invariant is load-bearing for the entire premise.

## Non-goals

Not a marketplace. Not a social network. Not a content site. Not affiliate-monetized — the resale aggregators in this space (Gem, Beni) run on affiliate revenue and that's a legitimate model, but it puts a thumb on the scale of what gets recommended, and we'd rather stay unencumbered. No monetization at all is a feature: it's why the zero-cost constraint is survivable.
