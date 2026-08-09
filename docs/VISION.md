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

Five tests. An idea has to pass all five.

1. **Small.** One session builds it. If it needs a roadmap, it's a product company, not a Voyeur app. Scope down until it fits, or drop it.
2. **Complete.** "Simplest" is not "minimal." The simplest *complete* implementation solves the whole problem the person actually has, using the best available technique. A half-answer is worse than nothing because it burns the user's trust and the catalog's.
3. **Zero-cost to operate.** No paid APIs, no metered inference, no database bills, no key that expires. Costs must not scale with users, because we cannot pay them and we will not rate-limit users to avoid paying them.
4. **No signup.** No accounts, no email capture, no onboarding wall. State lives in the browser (localStorage / IndexedDB) or in a URL you can bookmark and share.
5. **Actually wanted.** Backed by evidence that real people asked for this, repeatedly, in public. Not a clever idea we liked.

An app that fails #3 is not a smaller app — it's a different project. Photorealistic virtual try-on is the standing example: the open-source models exist and are good, and every one of them needs a GPU. It's out of scope until that changes, no matter how much demand there is for it.

## What success looks like

A stranger with a real fashion problem lands on the catalog from a search result, finds the entry that matches their problem, clicks through, and has the problem solved in under a minute — without creating an account, without hitting a paywall, and without ever knowing or caring that no human was involved in making it.

Second-order, in rough priority:
- The catalog is a genuinely useful destination for fashion problems, independent of the AI story.
- The AI story brings people who then find the apps useful.
- The run logs and adversarial transcripts are an honest public record of what autonomous building actually produces — including the failures.

## What failure looks like

Worth naming so it can be recognized early:

- **Filler.** A shelf of twelve color-analysis clones because they were easy. Shipping nothing beats shipping filler — the catalog's value is the hit rate, not the count.
- **Rot.** Twenty apps, eight of them broken, nobody checking. Maintenance is part of every cycle, not a someday task.
- **Dishonesty.** An app that claims to estimate your measurements to the centimeter and is off by four. Overstatement is the fastest way to make the whole catalog worthless.
- **Drift.** Apps that quietly need a key, an account, a paid tier. The zero-cost invariant is load-bearing for the entire premise.

## Non-goals

Not a marketplace. Not a social network. Not a content site. Not affiliate-monetized — the resale aggregators in this space (Gem, Beni) run on affiliate revenue and that's a legitimate model, but it puts a thumb on the scale of what gets recommended, and we'd rather stay unencumbered. No monetization at all is a feature: it's why the zero-cost constraint is survivable.
