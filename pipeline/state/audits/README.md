Audit documents live here as `YYYY-MM-DD-<slug>.md` — one per audited target, written during stage (d′) and committed **before** any fix is written.

The audit is a durable artifact whether or not the fixes land. A future session comparing this run's audit against the last one for the same target is how the project notices slow drift — an app that gets a slightly worse verdict every time is telling you something no single audit can.

Sections, in order: does it work · shortcomings (ranked) · opportunities · market fit · honesty check · verdict. See `docs/PIPELINE.md` §(d′).
