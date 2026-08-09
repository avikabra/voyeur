# Pipeline

One cycle, eight stages, one session. What follows is **intent and exit criteria**, not a script. You are running a strong model with good judgment; the stages tell you what a stage is *for* and when it's *done*, and leave the method to you. Skip a stage when you can articulate why, and say so in the run log.

The most important thing on this page: **a run that ships nothing is a successful run.** Filler is worse than an empty shelf.

---

## (a) Scout — find unmet needs

**Intent.** Mine public conversation for fashion consumers describing software they wish existed.

Use WebSearch with the pain-phrase patterns in RESEARCH §4 against the communities listed there. Snippet mining is the tool — do not attempt direct Reddit fetches, they're dead as of May 2026. App Store review RSS is the second-best vein: 1-star reviews of paid fashion apps are people telling you exactly what's missing, with the demand already proven.

Read the *replies*, not just the wish. "Does this exist?" answered with "yeah, use X" is a solved problem. Answered with silence or "I've looked, there's nothing" is a lead.

**Also part of Scout: check the shelf.** Sample a few live apps from `shipped.md` — actually fetch their URLs, actually drive one with Playwright. A broken shipped app outranks any new idea. If you find one, jump to Maintenance (below) and treat fixing it as this run's build.

**Exit criteria.** Three to eight candidate needs, each with: the need in the user's own words, links to the posts that show it, a note on how many independent people expressed it, and what exists today. Or: the honest finding that nothing new surfaced — also a valid exit, write it down and go help the shelf instead.

**Anti-patterns.** Mining one subreddit and calling it signal. Treating a single enthusiastic post as demand. Reaching for a candidate because it's easy to build rather than because people asked for it.

---

## (b) Select — pick one, or none

**Intent.** Reduce candidates to exactly one build target.

First, **dedupe against state**: `shipped.md` (built it), `rejected.md` (considered and declined — *read the reasoning before overriding it*, and if you do override, say why), `backlog.md` (known, unbuilt). Re-litigating a settled rejection wastes a whole cycle.

Then weigh three things together:

- **Demand.** How many independent people, over what span, how specific. Repetition beats intensity.
- **Feasibility.** Can one session build this, completely, today? The honest question is not "could this be built" but "will the thing I ship in four hours actually solve their problem."
- **Zero-cost fit.** Does it survive the five tests in VISION? Any paid dependency, any per-user cost, any signup requirement is disqualifying — not a design challenge.

Multiply, don't average. A zero on any axis is a zero overall.

**Zero is a valid answer.** If nothing clears the bar, record why in the run log, add the near-misses to `backlog.md` with their evidence, and spend the run on maintenance or on deepening research for next time. Do not build the fifth-best idea because a run felt obligated to produce something.

**Exit criteria.** One chosen need with a written justification, or a documented decision to build nothing. `backlog.md` and `rejected.md` updated either way.

---

## (c) Research — how to build it well

**Intent.** Find the **simplest complete cutting-edge** implementation. Each word carries weight:

- **Simplest** — fewest moving parts, least infrastructure, least that can rot.
- **Complete** — solves the whole problem, not a demo slice of it. Simplest ≠ minimal.
- **Cutting edge** — use the best technique currently available, not the first one you thought of. The browser-ML stack in RESEARCH §2 is stronger than most people assume; check whether something better shipped since.

Cover: what already exists and why it doesn't satisfy people (this is your differentiation); data dependencies and their licenses; model options with size, license, and browser-executability; the specific hard part (there's always one — usually calibration, data curation, or an accuracy claim you can't honestly make); and how you'll know it works.

**Exit criteria.** A defensible technical approach where every dependency is free, license-compatible with MIT, and browser-executable — plus a named plan for the hard part. If research reveals the app can't meet the constraints, **go back to Select**. Discovering it at this stage is a good outcome, not a wasted run. Record it in `rejected.md` with the reasoning; that entry saves a future session the same four hours.

---

## (d) Plan — decompose for parallel waves

**Intent.** Turn the approach into modules that independent agents can build simultaneously without stepping on each other.

Structure it as **waves**. Wave 1 has no dependencies and runs fully parallel — data curation, core logic module, UI shell, model loading harness. Wave 2 depends on wave 1's interfaces. Usually two or three waves is right.

The load-bearing part is **interfaces defined before the wave starts**. Exact function signatures, exact data shapes, exact file paths. Two agents writing against a vaguely described boundary will produce two incompatible halves and you'll spend the integration budget on reconciliation. Write the types first.

Each module gets: a file path it owns exclusively, its inputs and outputs as concrete signatures, what "done" means, and what it must not touch.

**Exit criteria.** A plan another agent could execute without asking you a question. If a module's description would require a clarifying question, it's underspecified.

---

## (e) Build — parallel implementation agents

**Intent.** Execute the plan. One agent per module, launched in parallel within a wave.

Give each agent the full context it needs — the relevant docs, the interface contract, the constraints — and let it work. Don't micromanage a strong agent through a well-specified module.

Between waves: integrate, run it yourself, confirm the pieces actually fit. Integration failures are usually interface drift; fix the interface, not the symptom.

**Exit criteria.** An app that builds and runs locally, that you have personally used and seen work. Not "the agents reported success" — you opened it and it did the thing.

---

## (f) Adversarial loop — try to break it

**Intent.** Find everything wrong with it before a stranger does. This is the stage that separates Voyeur from a directory of AI demos, and it is where most of the value gets added.

Run three kinds of adversary, in parallel, against the real build:

- **Code reviewers.** Correctness, edge cases, error handling, license compliance, accidental cost (did anything sneak in a paid API, a key, an analytics beacon, a fetch to something we don't control), performance on a mid-range phone.
- **Adversarial breakers.** Actively hostile. Empty inputs, enormous inputs, wrong file types, a 40MB photo, a photo of a dog, unicode, offline mid-operation, hitting back, double-clicking everything, a 375px viewport, localStorage full, localStorage disabled.
- **Simulated first-time users.** **Playwright against the actual running build**, not a reading of the code. Arrive with a real problem, no instructions, no context. Can they solve it? Where do they hesitate? What do they think it does that it doesn't? Where do they give up? Run several with different problems and different levels of patience.

They report to **you, the orchestrator**. You triage, fix, and re-run the loop. **You are instructed to be hard to please.** Two or three rounds is normal. A first round that comes back clean means the adversaries were too gentle — sharpen them and go again.

**The bar, and it is the only bar:** *would a stranger with this problem actually use this, and would it actually work for them?* Not "is it impressive," not "did we do what we planned," not "are the tests green." Bugs that don't affect that answer can ship as known limitations in the manifest. Anything that does, blocks.

**Exit criteria.** You are genuinely satisfied — meaning you'd send it to someone whose opinion you cared about. If after several rounds it isn't there, **don't ship it.** Leave it in `apps/<slug>/` with `status: "wip"`, write down exactly what's unresolved, and let the next session finish or kill it. Shipping something you're not satisfied with poisons the catalog.

---

## (g) Deploy — and verify it actually works

**Intent.** Get it live and *prove* it's live. A deploy that reports success and serves a broken page is the worst outcome in the pipeline, because nobody is watching.

1. Deploy with the Vercel MCP tools. Project name `voyeur-<slug>`.
2. **Verify against the real URL.** Fetch it. Then drive the deployed app with Playwright and complete the core user journey end to end. Production differs from local — asset paths, model file loading, CSP, cold caches. Assume nothing.
3. Update `manifest.json` with `liveUrl` and `status: "live"`.
4. Rebuild and redeploy the catalog site so the entry appears.
5. Load the catalog and click through to the new app like a user would. The whole chain, not just the endpoint.

**Exit criteria.** A URL you have personally exercised in production, reachable from the catalog, working on a mobile viewport.

---

## (h) Record — leave the trail

**Intent.** The next session's context is only what you write down. There are no notifications, no dashboards, and no human. The state files and git history *are* the record.

Update:
- `pipeline/state/shipped.md` — new row.
- `pipeline/state/backlog.md` — remove what you built, add near-misses with their evidence.
- `pipeline/state/rejected.md` — everything you declined, **with reasoning**. This file's whole value is preventing re-litigation.
- `pipeline/state/runs/YYYY-MM-DD-HHMM.md` — the run log.

**The run log** should be readable in two minutes: what you scouted and where, candidates found, what you picked and why, **what you rejected and why** (the most valuable section), what you built, what the adversarial loop caught and how many rounds it took, what shipped, deviations from these docs and your reasoning, and what you'd tell the next session.

Then **commit and push everything.** A run that isn't pushed didn't happen.

---

## Partial progress

Four hours is often not enough. That's expected and fine — **the failure mode to avoid is a session restarting from zero because the previous one left no trail.**

Write state as you go, not at the end. If you're mid-build when time runs short:

- Commit what exists, however incomplete.
- Set `manifest.status` to `"wip"`.
- Write the run log *now*, including: which stage you're in, what's done, what's next, and any decision you made that isn't obvious from the code.
- Push.

A session that reads a clear "I'm in stage (e), wave 1 done, wave 2 module `matcher.js` is the next thing, here's the interface" resumes in minutes. Continuing someone else's good work beats starting fresh — check `runs/` for the most recent log before assuming you're starting clean.

---

## Maintenance

**Fixing a broken shipped app is a fully legitimate use of a cycle, and it outranks building new.** Twenty apps with eight broken is worth less than eight that all work.

Checking a sample of live apps is part of Scout, every run. What breaks, in rough order of likelihood: an upstream data source changing shape, a CDN-hosted dependency disappearing, a browser API deprecation, a model file failing to load, a Vercel project going stale.

When you find breakage: fix it if you can, in which case it goes through the adversarial loop and deploy verification like any build. If you can't fix it this run, set `status: "broken"` in the manifest, push, and write clearly what's wrong. The catalog shows it as broken — honest and unusable beats a silent dead link.

Some apps deserve to die. If the need evaporated, or an upstream dependency is permanently gone, or it was a mistake: retire it. Set `status: "retired"`, note why, keep the code and the run log. A retirement recorded with reasoning is worth more than a zombie kept alive out of sunk cost.
