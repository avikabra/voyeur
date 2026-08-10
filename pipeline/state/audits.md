# Audits

The audit ledger. Every audit cycle reads this to pick its target and appends a row before it finishes.

**This file is what makes staleness weighting possible.** Without it, stage (a′) samples blind and the same app gets audited three times while another goes a month untouched. Write the row even when the verdict was *leave alone* — especially then.

## How to use it

Take the half of the target pool that was least recently audited (never-audited counts as infinitely stale), pick at random from within that half, and skip anything the most recent run log shows as an active build. See `docs/PIPELINE.md` §(a′) for the full rule.

## Target pool

Everything the project consists of is auditable, not just the apps.

| target | kind | notes |
|---|---|---|
| `apps/vinted-size-decoder` | app | live since 2026-08-09 |
| `apps/silhouette-tryon` | app | wip as of 2026-08-10 — **skip while the build is active** |
| `site/` | catalog | the front door; gets less attention than anything it links to |
| `docs/` | docs | load-bearing for every session; a stale fact here costs every future run |
| `pipeline/` | process | the two-track rhythm, run-log legibility, whether `backlog.md` is a queue or a graveyard |

Keep this table current — a new app that never gets added here never gets audited.

## Ledger

Newest last. `verdict` is one of **fix** · **extend** · **retire** · **leave alone**.

| target | date | verdict | audit | what changed |
|---|---|---|---|---|
| _(none yet — the audit track was introduced 2026-08-10)_ | | | | |
