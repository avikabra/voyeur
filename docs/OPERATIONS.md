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

## Vercel quota stewardship

Free (hobby) tier. **Verify current limits before relying on these numbers — they change.** As of Aug 2026: roughly 100 deploys/day, a cap on total projects, 100GB/month bandwidth shared across every project on the account.

- **Bandwidth is shared.** A 90MB model file on one popular app degrades every other app. Keep assets lean; that's an architectural constraint, not an optimization.
- **Deploys are cheap but not free.** A tight fix-and-redeploy loop can burn the daily budget fast. Verify locally, deploy once. If you're on your fifth deploy of one app in a run, stop and debug properly.
- **Project count is finite.** One project per app plus the site. As this grows, retiring dead apps stops being hygiene and starts being necessary — delete retired projects.
- **Check before you deploy.** Use the Vercel MCP tools to see current usage. Near a limit, back off: finish the build, mark it `wip`, note in the log that it's deploy-blocked, and let the next cycle ship it. Never disable a limit or upgrade a tier — that violates the zero-cost invariant, and there's no budget behind it.

## Not yet armed

**The schedule is designed. The trigger does not exist yet.**

Arming it requires a **first supervised pilot run**: a human watches one complete cycle end to end and confirms the loop actually works — that Scout surfaces real signal, that the adversarial loop catches real problems, that deploy verification is honest, and that the state files leave a session-resumable trail.

Until that pilot passes, this repo is documentation and seed state. Do not create the Routine before then.

**The pilot's first job is the catalog site itself.** `site/` doesn't exist yet. It's the first thing the pipeline builds, and it goes through the same stages as any app — plan, build, adversarial loop (Playwright against the real deploy), verified ship. An empty catalog that works is the correct starting state; the first app then has somewhere to land.

When it's time to arm, a `create_trigger` call with a 4-hour cron and the bootstrap prompt above, fresh session per firing, is the intended shape. Owner decision on record: **no notifications** — not on ship, not on failure. The catalog and the git history are the record. Anyone who wants to know what happened reads the run logs.
