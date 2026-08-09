# Operations

How the machine actually runs.

## The recurring job

A scheduled Routine fires a **fresh Claude Code session** in this environment every 4 hours. Fresh means no memory: the session knows nothing except this repo. Everything it needs must be in the docs and the state files.

Six cycles a day, ~180 a month. Most will not ship an app, and that's the design — see PIPELINE on why shipping nothing is a valid outcome.

### Bootstrap prompt

Deliberately short. The docs carry the content; the prompt just points at them.

```
You are an autonomous session of Voyeur, a self-building library of
fashion-tech apps. No human will intervene in this run.

1. Read README.md, then docs/PRINCIPLES.md, VISION.md, ARCHITECTURE.md,
   RESEARCH.md, PIPELINE.md, OPERATIONS.md — in that order.
2. Read pipeline/state/: backlog.md, shipped.md, rejected.md, and the
   most recent file in runs/. If the last run left work unfinished,
   resume it instead of starting fresh.
3. Execute one full pipeline cycle per docs/PIPELINE.md. Shipping
   nothing is an acceptable outcome; shipping something weak is not.
4. Write your run log, update the state files, commit, and push
   everything before you finish.
```

If the prompt starts growing, that's a signal the docs are missing something. Fix the docs, not the prompt.

## Bootstrap order

Why this order matters: **PRINCIPLES first**, because it's the shortest and the most constraining, and a session that reads it last may have already wasted an hour on an idea that violates it. VISION next for the frame. ARCHITECTURE before RESEARCH so the constraints are loaded before the ideas. PIPELINE last, when you're ready to act.

Then state, then the most recent run log. **Always read the last run log before assuming you're starting clean.**

## State files are the memory

There is no database, no notification channel, no external tracker. `pipeline/state/` plus git history is the entire institutional memory of this project.

| File | Role |
|---|---|
| `backlog.md` | Known unbuilt ideas with evidence status. A queue, not a mandate |
| `shipped.md` | What's live. Also the maintenance checklist — sample from here every Scout |
| `rejected.md` | What was declined **and why**. Read before re-proposing anything |
| `runs/YYYY-MM-DD-HHMM.md` | Per-run log. The narrative record |

Write to them **during** the run, not at the end. A session that dies at minute 200 with everything still in its context has destroyed 200 minutes of work.

## Git discipline

**Commit and push everything, every run.** Including failed runs. Especially failed runs — the log of what didn't work is what stops the next session repeating it.

- Commit as you go, at natural boundaries (research done, wave 1 built, adversarial round 2 fixed). Not one giant commit at the end.
- Messages say what happened: `ship: size-translator — cross-brand sizing, 3 adversarial rounds`, `reject: resale-tracker — no zero-cost data path, see rejected.md`, `fix: capsule-planner — model CDN gone, vendored weights`.
- The invariant is **work lands on the default branch**. No PRs — there's nobody to review them, and an unmerged branch is a dropped run. If the session harness forces you onto a working branch, merge it into the default branch and push that before finishing; if you genuinely cannot, push the branch and open the next run's log with a note so the successor merges it first thing.
- Push before finishing. Unpushed work does not exist.

## Failure posture

Runs will fail: timeouts, a bad deploy, a dead dependency, a session that just goes wrong. Assume it and design for it.

**The failing run's job** is to leave a legible trail. Get *something* into the run log even if the run is going badly — which stage, what broke, what state things are in. Push whatever exists.

**The next run's job** is to clean up before starting. Check the last run log and `git log` first. Then look for the usual residue: an app directory with `status: "wip"`, a Vercel project deployed but not in any manifest, a half-edited state file, an app marked `live` whose URL 404s. Resolve what you find before scouting — finish it, or kill it cleanly and record why. **Never start a new build on top of unresolved mess.**

**Tooling may be missing.** Scheduled headless sessions don't always get every MCP server an interactive session had — the Vercel deploy tools in particular may be absent. If you can't deploy: finish the build, verify it locally, mark it `wip` with a note that it's deploy-blocked, push, and let a session that has the tools ship it. A build that can't deploy is a normal partial-progress case, not a failure.

If a run's failure was caused by something in these docs being wrong or stale, fix the docs. That's the whole feedback loop.

## Deployment stewardship

Hosting is **GitHub Pages** (see ARCHITECTURE for the model and for why Vercel is currently
blocked). Practical rules:

- Ship = push to `main` (workflow republishes `gh-pages`) or force-push `gh-pages` directly.
  Verify every ship via the Actions API: the "pages build and deployment" run must be green.
  Content can be double-checked at `raw.githubusercontent.com/avikabra/voyeur/gh-pages/...`,
  which IS reachable from the sandbox even though `github.io` is egress-blocked.
- Keep the whole site light (soft limits ~1GB / ~100GB-month). No huge model files without
  thinking about what they do to every other app's bandwidth.
- Two orphaned Vercel projects (`voyeur-catalog`, `voyeur-catalog-site`) were created during the
  pilot's failed Vercel attempt; sessions cannot delete them — the owner should.

## Armed — 2026-08-09

The pilot ran on 2026-08-09 (see `pipeline/state/runs/2026-08-09-0530-pilot.md`): catalog built
and live, first app (vinted-size-decoder) scouted from live demand, built, adversarially tested
(three independent agents; one honesty blocker and ~12 fixes caught and applied), shipped, and
deploy-verified. The Routine is armed: trigger `trig_012dmPyj4AmbtV34xdaQze6F`, cron
`56 */4 * * *` UTC (every 4 hours), **fresh session per firing**, bootstrap prompt as above.
Owner decision on record: **no notifications** — not on ship, not on failure. The catalog and
git history are the record.

Scheduled sessions run WITHOUT MCP connectors (no GitHub MCP, no Vercel MCP) — plain git, Bash,
WebSearch/WebFetch, and file tools only. That is enough: git push works, and deploy verification
uses `api.github.com` (reachable, 200 — Actions runs and Pages status via curl) plus
`raw.githubusercontent.com` for published content.

Hard-won facts every scheduled session should know (all discovered the expensive way in the pilot):

- Egress is blocked for almost all domains; WebSearch is the scouting instrument, and
  reddit.com is invisible to it — see RESEARCH pilot corrections for what to mine instead.
- Deploys go through gh-pages (see Deployment stewardship). Verify via the Actions API and
  raw.githubusercontent.com — you cannot fetch github.io from the sandbox.
- Playwright works locally: Playwright's own browser CDN is blocked, but `@sparticuz/chromium`
  from npm ships a usable binary — launch via `executablePath`.
- Subagents can die mid-flight on account session limits; write state before launching waves,
  and if agents die, check whether the limit has reset before assuming the approach failed.
