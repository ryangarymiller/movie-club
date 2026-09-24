# Movie Club 2.0 — Design Notes

> Status: **design, not built.** Captured from the club's 2.0 rules (Ryan Bey, Sept 2026) plus
> Ryan Miller's decisions. This is the input document for high-level planning.
> Source-of-truth order still applies: `MOVIE_CLUB_SPEC.md` → `CLAUDE.md` → `PLAN.md`.
> Nothing here is implemented yet; **1.0 remains live and untouched.**
>
> **The plan:** `MOVIE_CLUB_2.0_PLAN.md` (architecture, phases, parallel-agent map, open decisions).
> **The evidence:** `docs/2.0-inventory/` — four codebase inventories (ui-surface, db-layer,
> awards-stats, membership-identity), each item tagged with its 1.0 assumptions and a preliminary
> carry / adapt / retire verdict. These are the input to the R2 parity audit.

---

## 0. Two hard rules (imperatives, not preferences)

### R1 — 2.0 must be revertible to 1.0 at any time
We are not required to build anything *new* in 1.0, but reverting must remain **possible**.
Concretely, this means the 2.0 work is bound by:

- **Additive-only schema.** The 2.0 migrations must never `DROP` or destructively `ALTER` any 1.0
  table, column, view, function, trigger, or cron job. New concepts get new tables.
- **Guard, don't delete.** 1.0 machinery that must not fire during 2.0 (the auto-activation cron,
  the deadline-enforcement cron, the completeness gate) gets **scoped off** by a mode discriminator,
  not removed.
- **Revert = flip a flag.** Reverting must not require a data migration or a code rollback.
- **Shared history survives a revert.** Films watched under 2.0 still live in `movies`/`ratings`,
  so stats and history stay intact in either direction.

### R2 — Every 1.0 feature gets an explicit, verified verdict
Carry over as much as possible — but **every single feature must be individually checked on two
axes**, and the check must be real (exercised), not assumed:

1. **Does it still work?** (functionally intact against the new data model)
2. **Does it still make sense?** (coherent in a 1-film-at-a-time, vote-elected world)

No feature is carried over by default or by assumption. The output is a complete inventory of every
feature, page, component, RPC, trigger, cron, award, and stat with a verdict of
**carry as-is / adapt / retire**, plus evidence for the "works" claim. This is the single largest
piece of the 2.0 effort and is well suited to parallel agents.

---

## 1. The core inversion

**1.0:** every member picks 1 film → the club watches all 4–5 in parallel that month, each on its
own staggered deadline. The month is the unit of everything.

**2.0:** members submit 0–2 films into a themed **candidate pool** → a ranked vote elects **one**
film → the club watches that one film together → **nobody moves on until everyone has seen it** →
repeat from the same list if the month allows.

Consequence: the film, not the month, becomes the unit of the watch cycle. A month now contains
**1..N films** (variable), and progression is **gated on people, not dates**.

---

## 2. The rules (as written by the club)

1. We cannot move on until everyone has seen the movie.
2. You can submit 0, 1, or 2 movies per selection process. No more than 2.
3. There is no limit to the number of times you can submit the same movie for consideration.
4. Idc how we choose themes.
5. Movie selection deadlines are final.
6. You can change your selection before the deadline.
7. You're allowed to vote for your own movies.
8. The movie can be one you have seen before, although that is discouraged.
9. If a movie cannot be determined through vote, the movie will be selected randomly.

**Outline:**
- Before every month, members submit up to 2 movies before the deadline → this creates the
  potential movie list.
- At the deadline the list is sent out. Members select their **top 3 in order of watch preference**.
  Votes determine the movie watched.
- No new movie is selected and no new list is created until **all members have watched** the movie.
- Each month has a **theme**. If a movie is finished before month end, another movie is selected
  from the **same list**. If not, a new list with a new theme is created.

**October 2026:** theme Halloween/Horror. Submissions due EOD Mon Sept 28. Target start Oct 1.

---

## 3. Decisions locked

| # | Decision |
|---|---|
| A1 | **Borda count.** Top-3 ranked ballot: 1st = 3 pts, 2nd = 2, 3rd = 1. Highest total wins. Ties → **random** (rule 9). |
| A2 | **No hard enforcement deadline on voting/watching.** Self-gating — the next round can't start until everyone has done their part; group pressure is the intended mechanism. |
| A3 | **Re-vote** for each subsequent film from the same list — not a reuse of the original tally. |
| B4 | **Submitting your score is the "I've watched it" signal.** No separate watched button. |
| B5 | **Admin can mark a member absent** to unblock a stalled cycle. Escape hatch for rule 1. |
| C6 | **Submissions are anonymous** during voting. |
| C7 | **Track picker and voter separately** — who submitted and who voted for it are distinct facts. |
| **C6b** | **The submitter is revealed once every member has scored that film.** |
| **C7b** | **Voters and their ballots are revealed at the same moment** — after everyone has scored. |
| **B7** | **Scores reveal the instant the last member scores.** That same event unblocks the next round. One trigger; no deadline crons. |
| D8 | Aim for **≥1 film/month, possibly more**. If a film isn't finished by month end, the next month **doesn't start until everyone finishes** — the month then **starts late**. Months drift off the calendar by design. |
| D9 | **Unused candidates are discarded** when a new list is created. Members may resubmit them (rule 3). |
| D10 | Theme is a **free-text label**; it does not gate submissions (rule 4). *(Assumption — confirm.)* |
| E11 | **Mike joins** as the 6th member. Email kept out of this repo (public) — goes into the `users` row. |
| E12 | **Era-aware history.** Keep 1.0/2.0 data separable, combine where genuinely comparable. Boundary = Oct 2026. |
| F13 | **Don't cut corners for Oct 1.** October may run manually over text; correctness first. |
| **G1** | **Awards:** most monthly awards retire at 1–2 films/month, but a reduced set of monthly awards that still make sense should be **designed fresh** — don't just delete the tier. |
| **G2** | **1.0 stays live** while 2.0 is built alongside it. |
| **H1** | **Plan approved** (`MOVIE_CLUB_2.0_PLAN.md`); Phase 0 runs autonomously with one report at exit. First prod apply is still a checkpoint. |
| **H2** | **Dev isolation = local `supabase start` on Ryan's gaming laptop**, kept as an always-on device. Not in the cloud container, not a Supabase branch, not a second project. |
| **H3** | **One submitter per film per round.** A second member submitting the same film sees "already on the list". Keeps the submitter single-valued (guess-the-picker, predictions, picker credit). Across rounds, repeats stay allowed (rule 3). |
| **H4** | Defaults accepted for the remaining §5 / plan §6 questions unless Ryan objects: submission deadline hard-locks via cron · <3 candidates → rank all, 1 auto-elects · tally hidden until close · scoring model unchanged · admin one-tap opens the next vote / closes the month · veto scoped off in v2 · submitter makes score predictions · non-winning submissions revealed at month close · Mike created at cutover after the trigger fix. |

---

## 4. Running 1.0 and 2.0 in parallel

Yes — this works, in three layers. It's also what makes R1 (revert) real.

**Layer 1 — build isolation (now).** Develop 2.0 against a **Supabase branch** (preview database)
plus a **Vercel preview deployment**. Live 1.0 and its production data are never touched while
building. Merge the branch only at cutover.

**Layer 2 — coexistence in production (at cutover).** 2.0 is **purely additive**:
- New tables for the new concepts (rounds/lists, submissions, ballots).
- `movies`, `ratings`, `reviews`, `comments`, `users`, `seasons` are **shared** by both eras — which
  is exactly what E12's era-aware history needs.
- A **mode discriminator** on `months` (e.g. `mode 'v1' | 'v2'`, default `'v1'`) records which
  lifecycle governs each month. 1.0's crons and gates get `mode = 'v1'` guards instead of deletion.

**Layer 3 — the switch.** A single app-level setting (e.g. `app_settings.club_mode`) decides which
flow the UI serves for the current round. Flipping it back is the revert.

**The one real constraint:** two *lifecycles* can't govern the **same month**. August and September
finish under v1; the first v2 round begins on its own month marked `mode='v2'`. "Parallel" means
both code paths are live and both eras are queryable — not two competing active rounds.

---

## 5. Open questions

1. **Submission deadline vs. self-gating.** Rule 5 says selection deadlines are final (Sept 28 was
   set), but A2 says nothing really has a deadline. Working read: the **submission window
   hard-closes** (a non-submitter simply has 0 candidates in, per rule 2), while **voting and
   watching** wait for everyone. Confirm.
2. **Re-vote mechanics.** Watched films drop out and everyone re-ranks their top 3 of the remainder.
   If fewer than 3 candidates remain, rank all of them?
3. **Is the running tally visible before voting closes?** Default recommendation: hide until close.
4. **Scoring model carryover.** Assume unchanged: 0.01–10.00, pre-watch excitement,
   recommend-outside-club, reviews/threads, rolling reveal. Confirm. *(Subject to R2 anyway.)*
5. **Mike's onboarding timing.** Create his user row now (inactive until Oct) or at cutover? Does he
   take part in October's manual round?

---

## 6. What carries over vs. what retires

> **Subject to R2** — nothing below is settled until individually verified. This is a starting
> hypothesis for the audit, not its conclusion.

**Expected to survive largely intact**
- Scoring engine (0.01–10.00, excitement, recommend, back-calculation)
- Reviews / threaded discussion, reactions, votes, @mentions
- Anonymity + rolling reveal (C6 keeps this alive)
- Guess-the-picker — now "who put this on the list", revealed per C6b
- Stats, Connection Web, person pages, film tags
- Themes/accents, avatars, notifications, push/email, guest mode
- Seasons + seasonal readjustment

**Needs rework**
- Awards catalog — monthly tier must be redesigned, not deleted (G1)
- "Picker" semantics — a film wins by vote, not by one person's pick; picker and voter are now
  separate axes (C7), and both reveal together (C6b/C7b)
- Stats counting "films picked per member" — meaning changes across the era boundary (E12)

**Expected to retire**
- `upcoming_picks` one-per-member-per-month model
- `month_picks_complete` completeness gate + gated auto-activation
- Per-film staggered `scoring_deadline` splitting and `enforce-due-deadlines`
- Calendar-driven auto-activation (`cron_auto_activate_due_months`, `active_date`, `auto_activate`)
  — progression is people-gated now

*(Per R1 these are **scoped off**, not dropped.)*

---

## 7. Data model sketch (for planning, not final)

New concepts:
- **list / selection round** — themed candidate pool belonging to a month; submission window; state
  (collecting → voting → watching → closed); discard-on-close (D9).
- **submission** — 0..2 per member per round; anonymous until reveal; repeatable across rounds (rule 3).
- **ballot** — one per member per vote, ordered top-3, Borda-scored (A1); re-issued per film (A3).
- **watch cycle** — the elected film plus the set of members who still owe a score (B4); completion
  reveals scores + submitter + voters (B7/C6b/C7b) and unblocks the next round.
- **absence** — admin-set; excludes a member from blocking a cycle (B5).

`movies` stays the film record. `months` stays the container, gains `mode`, and loses its
date-driven activation machinery in v2 months.

---

## 8. Known debt to fold in

**Test account is hardcoded in 41 places across 25 files.** The filter
`email <> '<test account>'` is inlined across `src/`, the `ai-recap` edge function, and numerous SQL
migrations. Proper fix: add a **`users.is_test` boolean** flag, set it once, and replace every
hardcoded comparison with it.

Notes:
- Historical migrations are append-only records — they are not rewritten. The live functions get
  **redefined by a new migration**.
- Scrubbing current files does **not** remove the address from **git history**; a true purge needs a
  history rewrite + force-push of a public repo. (Mitigating: it is Ryan's own test address, not a
  member's.)
- Every one of those 41 sites is a "hide this member" rule inside a feature that **R2 requires us to
  audit anyway** — so this refactor should ride along with the parity audit rather than be a
  separate pass.

---

## 9. Cutover

- 1.0 stays live until 2.0 is ready; October likely runs manually over text (F13, G2).
- Era boundary at Oct 2026 for stats separability (E12).
- Jan–Sep 2026 history preserved exactly as-is.
