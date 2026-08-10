# Pipeline

One cycle, one session. What follows is **intent and exit criteria**, not a script. You are running a strong model with good judgment; the stages tell you what a stage is *for* and when it's *done*, and leave the method to you. Skip a stage when you can articulate why, and say so in the run log.

**There are two cycles, and you run exactly one of them.** OPERATIONS tells you which — build on the 00 and 12 UTC firings, audit on 06 and 18.

| Cycle | Stages | For |
|---|---|---|
| **Build** | (a) Scout → (b) Select → (c) Research → (d) Plan → (e) Build → (f) Adversarial → (g) Deploy → (h) Record | Putting something new on the shelf |
| **Audit** | (a′) Sample → (b′) Use → (c′) Market → (d′) Findings → **(f) Adversarial → (g) Deploy → (h) Record** | Making what's on the shelf worth keeping |

The audit cycle rejoins the build cycle at stage (f). That's deliberate: an audit fix is a code change like any other and earns no exemption from the adversarial loop or from deploy verification. There is one set of those stages, and both cycles use it.

The most important thing on this page: **a build run that ships nothing is a successful run, and an audit run that changes nothing is a successful run.** Filler is worse than an empty shelf, and churn is worse than a stable one.

---

# Build cycle

---

## (a) Scout — find unmet needs

**Intent.** Mine public conversation for fashion consumers describing software they wish existed.

Use WebSearch with the pain-phrase patterns in RESEARCH §4 against the communities listed there. Snippet mining is the tool — do not attempt direct Reddit fetches, they're dead as of May 2026. App Store review RSS is the second-best vein: 1-star reviews of paid fashion apps are people telling you exactly what's missing, with the demand already proven.

Read the *replies*, not just the wish. "Does this exist?" answered with "yeah, use X" is a solved problem. Answered with silence or "I've looked, there's nothing" is a lead.

**Also part of Scout: smoke-check the shelf.** Fetch every live URL in `shipped.md` and confirm each one returns 200 and renders something that isn't an error page. That's all — this is a thirty-second check for a dead deploy, not an inspection. Deep inspection is the audit cycle's job now, and duplicating it here wastes half a build run.

If a URL is dead or the page is visibly broken, that outranks any new idea: jump to Maintenance (below) and treat fixing it as this run's build. Anything subtler — it loads but feels wrong, the results look off, a competitor now does it better — is not yours to chase. Note it in the run log and let the audit track pick it up.

**Exit criteria.** Three to eight candidate needs, each with: the need in the user's own words, links to the posts that show it, a note on how many independent people expressed it, and what exists today. Or: the honest finding that nothing new surfaced — also a valid exit, write it down and go help the shelf instead.

**Anti-patterns.** Mining one subreddit and calling it signal. Treating a single enthusiastic post as demand. Reaching for a candidate because it's easy to build rather than because people asked for it.

---

## (b) Select — pick one, or none

**Intent.** Reduce candidates to exactly one build target.

First, **dedupe against state**: `shipped.md` (built it), `rejected.md` (considered and declined — *read the reasoning before overriding it*, and if you do override, say why), `backlog.md` (known, unbuilt). Re-litigating a settled rejection wastes a whole cycle.

Then weigh four things together:

- **Breadth.** How large and global is the audience? A problem shared by shoppers everywhere
  outranks a single community's workaround, even with weaker thread evidence — big shared
  problems generate demand signal everywhere and don't need a perfect citation trail.
- **Demand.** How many independent people, over what span. Repetition beats intensity.
- **Feasibility.** Can the pipeline build this completely — across several sessions if needed?
  Multi-session ambitious builds (wip handoff) are the expected shape for the big targets, not
  an exception. "One quick session" is no longer the bar.
- **Zero-cost fit.** Does it survive the six tests in VISION? Any paid dependency, any per-user
  cost, any signup requirement is disqualifying — not a design challenge.

Multiply, don't average. A zero on any axis is a zero overall — but remember the owner's
standing direction: aim at the big shared problems (try-on, discontinued-item search, sizing at
scale), not small one-offs a chat reply could handle.

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

# Audit cycle

The build track's question is *what should exist that doesn't.* This track's question is *is what exists actually any good.* Nobody uses these apps in front of you, nobody files bugs, and nothing on the shelf will tell you it has stopped being worth the space. This cycle is the only mechanism that notices.

Four stages of your own, then you rejoin the build cycle at **(f) Adversarial** and run (f), (g), (h) exactly as written above.

---

## (a′) Sample — pick one or two targets

**Intent.** Choose what to audit, without letting the choice drift toward whatever is most interesting today.

**The target pool is wider than the apps.** Everything the project consists of is auditable:

- Each app in `apps/*`, whatever its status — including `wip` and `broken` ones, which are exactly the entries most likely to be quietly rotting. **One exclusion:** if the most recent run log shows a build is actively in progress on something, that app is off the table. Auditing a half-finished build tells you it's half finished, which you already knew, and risks two sessions editing the same files a cycle apart.
- **`site/`** — the catalog itself. It's the front door and it gets less attention than anything it links to.
- **The docs.** These files are load-bearing infrastructure for every session. A stale fact in RESEARCH or a stage in here that no longer matches reality costs every future run.
- **The pipeline and state files.** Is the two-track rhythm working? Are run logs actually legible to the session that inherits them? Is `backlog.md` a queue or a graveyard?

**Sample one or two, weighted by staleness.** Read `pipeline/state/audits.md`, take the half of the pool that was least recently audited (never-audited counts as infinitely stale), and pick at random from within that half. Uniform random over everything will hit the same app three times while another goes a month untouched; pure round-robin removes the judgment that catches things out of turn. This does both.

Take **two** targets if either is small or you expect a fast "leave alone." Take **one** if you already suspect there's real work — a thorough audit of one thing beats two shallow ones.

**Exit criteria.** One or two named targets and a sentence on why the sampling produced them. If you deviated from the staleness weighting — you had a specific reason to look at something — say what it was.

---

## (b′) Use — be a stranger with a real problem

**Intent.** Establish ground truth before forming any opinion. Everything downstream depends on this stage being honest.

**Drive the production URL, not the local build, with Playwright, on a mobile viewport.** Arrive with a concrete fashion problem of your own invention, no instructions, and no knowledge of how the app works. Complete the journey or fail to.

Then answer, from what actually happened rather than from the code: Did it work? Did it work *on the first try*? Where did you hesitate, guess, or backtrack? What did you expect it to do that it didn't? Was the answer it gave you good enough to act on — would you have made a real purchase decision on it?

Run more than one persona if the app has more than one real use. A seller and a buyer want different things from the same tool.

Check the mechanical things too, since you're already in there: console errors, dead vendored dependencies, model files that 404, CSP violations, load time on a throttled connection, layout at 375px.

**For non-app targets**, the equivalent is the same move — use it as its consumer. For the docs, that consumer is a fresh session: read them cold and ask what you'd have gotten wrong. For `site/`, it's a visitor who has never heard of Voyeur.

**Exit criteria.** A written account of what you did and what happened, specific enough that someone could repeat it. "It works" is not an account.

---

## (c′) Market — is this still the right thing to exist

**Intent.** The app can work perfectly and still not deserve the shelf. This is the stage that asks whether it's aimed at anything real.

Cover four things:

- **Is the need still live?** Re-check the `evidence` links in the manifest and search the current conversation for the same pain. Demand that was real in a thread six months ago may have been a moment, or may have been solved by a platform feature since.
- **What shipped since?** Competitors, yes — but also new browser-ML capability, new free data sources, new APIs. The best available implementation moves; an app built at the old ceiling may now be beatable by its own successor.
- **Who is it actually for, and is that who it's serving?** Apps drift. The tool that got built is often narrower than the need that justified it, or aimed at a subset of the people who have the problem.
- **What would make it materially more useful?** Not a feature list — the one or two changes that would move it from "neat" to "I'd use this every time." Be specific about which shortcoming from (b′) each one answers.

Same WebSearch discipline as build-cycle Scout: snippet mining, read the replies, RESEARCH §4 for the pain-phrase patterns and the sources that actually work.

**Exit criteria.** A defensible answer to *does this still deserve to be on the shelf, and if so, aimed at what*. Honest "the need evaporated" is one of the more valuable outcomes this cycle can produce.

---

## (d′) Findings — write the audit before you touch anything

**Intent.** Separate the judging from the fixing. A session that starts editing while it's still forming an opinion will fix whatever it happened to notice first and call the audit done.

Write `pipeline/state/audits/YYYY-MM-DD-<slug>.md` with these sections, in this order:

1. **Does it work** — what you drove in (b′), what happened, verbatim enough to be checkable.
2. **Shortcomings**, each ranked: **broken** (doesn't function) · **blocks the job** (functions, but the user can't get what they came for) · **friction** (they get there, annoyed) · **cosmetic**.
3. **Opportunities** — what would make it materially more useful, from (c′).
4. **Market fit** — is the need still live, what's changed, does the positioning or the target user need retargeting.
5. **Honesty check** — does `limitations` in the manifest still tell the truth? Has the app quietly grown a claim it can't support? This one is non-optional; honesty decay is invisible from the inside and it spends credibility for every app in the catalog.
6. **Verdict** — exactly one of **fix** · **extend** · **retire** · **leave alone**.

**All four verdicts are real.** *Leave alone* is not a failed audit — it is the correct verdict for a small tool that does its one job, and the whole cycle depends on you being willing to return it. An audit track that always finds work becomes a churn engine that edits working apps to justify its own existence, and that is a worse failure than not auditing at all. *Retire* is likewise a good outcome, on the same reasoning as PRINCIPLES §Quality bar: an app whose need evaporated should go, with the reasoning recorded.

**Exit criteria.** The audit doc exists and is committed **before** you write a line of fix. Commit it as its own commit — the audit is a durable artifact whether or not the fixes land.

---

## (e′) Fix — do the work this run

**Intent.** An audit that produces a document and no change is half a cycle. Take the findings and implement what fits.

**What to do this run:** everything ranked *broken* or *blocks the job*, plus whatever *friction* and *opportunity* work genuinely fits in the remaining time. Ordering is by that ranking, not by what's easiest.

**What not to do this run:** anything that amounts to a new build. If a finding needs a research stage and parallel waves, it isn't an audit fix — write it to `backlog.md` tagged with the slug and the audit doc it came from, and let a build cycle pick it up. That's the intended path from audit to major work: audit-generated improvements sit in the same queue as new-app ideas and **compete on the same four axes in Select**. An improvement to something people already use often wins that comparison, and should.

If the verdict was *retire*, this stage is the retirement: `status: "retired"` in the manifest with the reasoning, catalog rebuilt, code and history kept. If it was *leave alone*, this stage is empty and that's fine — say so in the run log and spend the remaining time on a second target, or on a backlog item the shelf needs.

**Then rejoin the build cycle at (f).** Your changes go through the adversarial loop and deploy verification unchanged. An audit fix that breaks the app it was fixing is the single most embarrassing thing this pipeline can do, and (f) is what prevents it. If you touched nothing, skip to (h).

**Exit criteria.** The fixes are implemented, adversarially tested, deployed, and verified against production — or the deliberate decision not to fix, recorded.

---

## (f′) Record — the ledger, not just the log

Stage (h) applies in full: run log, state files, commit, push. The audit cycle adds one thing.

Append a row to `pipeline/state/audits.md`:

| target | date | verdict | audit | what changed |
|---|---|---|---|---|

**This ledger is what makes (a′) work.** Without it, staleness weighting has nothing to read and every audit run re-samples blind. Write the row even when the verdict was *leave alone* — especially then, because that's the row that stops the next session auditing the same thing tomorrow.

Also update `shipped.md` if status changed, and `backlog.md` with anything you deferred.

---

# Both cycles

---

## Partial progress

One session is often not enough, and with build cycles now twelve hours apart, **multi-session builds are the normal shape for anything non-trivial, not the exception.** That's expected and fine — the failure mode to avoid is a session restarting from zero because the previous one left no trail.

Write state as you go, not at the end. If you're mid-build when time runs short:

- Commit what exists, however incomplete.
- Set `manifest.status` to `"wip"`.
- Write the run log *now*, including: which stage you're in, what's done, what's next, and any decision you made that isn't obvious from the code.
- Push.

A session that reads a clear "I'm in stage (e), wave 1 done, wave 2 module `matcher.js` is the next thing, here's the interface" resumes in minutes. Continuing someone else's good work beats starting fresh — check `runs/` for the most recent log before assuming you're starting clean.

**Unfinished work outranks your track.** The next session to fire may be an audit run; it should still finish your build rather than start sampling. Say so explicitly at the top of the run log — "BUILD RUN, wip: resume this before auditing anything" — because the successor decides its track before it reads your log.

Mid-audit is the same: commit the audit doc, note which findings are applied and which aren't, push.

---

## Maintenance

**Fixing a broken shipped app is a fully legitimate use of a cycle, and it outranks building new.** Twenty apps with eight broken is worth less than eight that all work.

Breakage gets caught two ways now. The build cycle's Scout smoke-checks every live URL — cheap, catches dead deploys. The audit cycle actually drives the app — slower, catches everything else. A build run that finds a dead URL fixes it that run; it does not wait for an audit. What breaks, in rough order of likelihood: an upstream data source changing shape, a CDN-hosted dependency disappearing, a browser API deprecation, a model file failing to load, a Vercel project going stale.

When you find breakage: fix it if you can, in which case it goes through the adversarial loop and deploy verification like any build. If you can't fix it this run, set `status: "broken"` in the manifest, push, and write clearly what's wrong. The catalog shows it as broken — honest and unusable beats a silent dead link.

Some apps deserve to die. If the need evaporated, or an upstream dependency is permanently gone, or it was a mistake: retire it. Set `status: "retired"`, note why, keep the code and the run log. A retirement recorded with reasoning is worth more than a zombie kept alive out of sunk cost.
