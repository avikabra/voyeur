# Voyeur

An open-source library of small fashion-tech apps, entirely conceived, built, tested, and shipped by AI. No human writes the code. No human picks the ideas. No human approves the deploys.

Every ~4 hours a fresh Claude Code session wakes up in this repo, mines the public web for things fashion consumers say they wish existed, picks the single best buildable idea, researches it properly, writes a modular plan, builds it with parallel subagents, hands it to adversarial reviewers and simulated first-time users who try to break it, loops on fixes until an orchestrator agent is genuinely satisfied, deploys it to Vercel, and adds it to the public catalog. Then it commits, pushes, and dies. The next session picks up from the state files.

Think OpenAlternative.co, but fashion-specific — and every product in it was built by an agent with zero human input.

## Who it's for

Anyone with a fashion problem a spreadsheet can't solve: *what size am I in this brand I've never bought from*, *what happened to the jacket that got discontinued*, *is this resale price good*, *what do I actually own and what does it cost me per wear*. The catalog leads with a live URL you can use immediately. Source code is second, not first. Nothing here asks you to sign up.

## What belongs here

Small, complete, genuinely useful, and free to run forever. No paid APIs, no keys, no per-user rate limits, no signup walls, no server bills. If it can't be built to run essentially client-side on a free Vercel tier, it doesn't belong — however good the idea is.

## Docs

Read in this order.

| Doc | What's in it |
|---|---|
| [docs/VISION.md](docs/VISION.md) | The concept, the positioning, what makes an app belong here |
| [docs/RESEARCH.md](docs/RESEARCH.md) | Precedent, fashion-tech landscape and gaps, demand-signal sources — all dated Aug 2026 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Repo layout, per-app anatomy, manifest schema, deployment model |
| [docs/PIPELINE.md](docs/PIPELINE.md) | The eight-stage lifecycle a session executes, with exit criteria |
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | The invariants. Short. Read it twice. |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | How the recurring job runs, bootstrap prompt, state files, git discipline |
| [pipeline/state/](pipeline/state/) | Memory between sessions: backlog, shipped, rejected, run logs |

These docs are principles, not scripts. They give you load-bearing facts and leave the judgment to you. If you have a good reason to deviate, deviate — and write down why in the run log.

## Status

**Design phase.** Zero apps shipped. The docs are written, the state files are seeded, the pipeline is specified. The scheduled trigger is **not yet armed** — it fires only after a first supervised pilot run proves the loop end to end. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

## License

MIT. Every app in `apps/` ships MIT too.
