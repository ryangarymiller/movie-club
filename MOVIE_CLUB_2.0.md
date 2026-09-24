# Movie Club 2.0 — Design Notes

> Status: **design, not built.** Captured from the club's 2.0 rules (Ryan Bey, Sept 2026) plus
> Ryan Miller's decisions. This is the input document for high-level planning.
> Source-of-truth order still applies: `MOVIE_CLUB_SPEC.md` → `CLAUDE.md` → `PLAN.md`.
> Nothing here is implemented yet; 1.0 remains live.

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
| A2 | **No hard enforcement deadline on voting/watching.** The process is self-gating — the next round can't start until everyone has done their part. Social pressure from the group is the intended mechanism. (See open Q1 re: the *submission* deadline, which rule 5 does treat as final.) |
| A3 | **Re-vote** for each subsequent film from the same list — not a reuse of the original tally. |
| B4 | **Submitting your score is the "I've watched it" signal.** No separate watched button. |
| B5 | **Admin can mark a member absent** to unblock a stalled cycle. This is the escape hatch for rule 1. |
| C6 | **Submissions are anonymous** on the voting list. The anonymity/reveal system survives. |
| C7 | **Track picker and voter separately.** Who submitted a film and who voted for it are distinct, separately-stored facts. |
| D8 | Aim for **≥1 film/month, possibly more**. If a film isn't finished by month end, the next month **doesn't start until everyone finishes** — the month then simply **starts late**. Months drift off the calendar by design. |
| D9 | **Unused candidates are discarded** when a new list is created. Members may resubmit them (rule 3). |
| D10 | Theme is a **free-text label** on the list; it does not gate or validate submissions (rule 4). *(Assumption — answer was "yes" to a two-part question; flag if wrong.)* |
| E11 | **Mike joins** as the 6th member. Email held out of this repo (public) — goes straight into the `users` row. |
| E12 | **Era-aware history.** Keep 1.0 and 2.0 data separable, but combine them where a stat is genuinely comparable. Boundary = the October 2026 cutover. |
| F13 | **Don't cut corners for the Oct 1 date.** October may run manually over text; correctness first. |

---

## 4. Open questions

1. **Submission deadline vs. self-gating.** Rule 5 says selection deadlines are final and a hard
   date was set (Sept 28) — but A2 says nothing really has a deadline. Working read: the
   **submission window hard-closes** at the deadline (whoever didn't submit simply has no
   candidates in the pool, per rule 2's "0"), while **voting and watching** wait for everyone.
   Confirm.
2. **Re-vote mechanics.** On re-vote, watched films drop out and everyone re-ranks their top 3 of
   what remains. What if fewer than 3 candidates remain — rank all of them?
3. **When is the submitter revealed?** Submissions are anonymous during voting. Does the submitter
   surface after the film is watched/scored, at month end, or never? This is what keeps
   guess-the-picker alive.
4. **Are votes themselves anonymous?** C7 says *track* picker and voter separately — but tracking
   isn't displaying. Who can see who ranked what, and when?
5. **Is the running tally visible before voting closes?** (Visible tallies change voting behavior;
   default recommendation is to hide until close.)
6. **Scoring model carryover.** Assume unchanged: 0.01–10.00 two decimals, pre-watch excitement,
   recommend-outside-club, reviews/threads, rolling reveal. Confirm.
7. **When do scores reveal?** There are no per-film deadlines any more. Natural answer: the film
   reveals the moment the last member scores — which is the same event that unblocks the next
   film. Confirm.
8. **Awards rework.** Much of the catalog is month-scoped and assumes 4–5 films/month. With 1–2
   films/month, monthly awards (Most Divisive, Pick of the Month) get thin or degenerate. Shift
   them to per-film or per-season?
9. **In-flight 1.0 state.** August 2026 is live (3 films, mid-scoring) and September exists as an
   `upcoming` month expecting one-pick-per-member. Do we finish those under 1.0 rules and then cut
   over, or clear September?
10. **Mike's onboarding timing.** Create his user row now (inactive until Oct) or at cutover? Does
    he take part in October's manual round?

---

## 5. What carries over vs. what retires

**Survives largely intact**
- Scoring engine (0.01–10.00, excitement, recommend, back-calculation)
- Reviews / threaded discussion, reactions, votes, @mentions
- Anonymity + rolling reveal (C6 keeps this alive)
- Guess-the-picker (pending Q3)
- Stats, Connection Web, person pages, film tags
- Themes/accents, avatars, notifications, push/email, guest mode
- Seasons + seasonal readjustment

**Needs rework**
- Awards catalog — month-scoped awards assume 4–5 films/month (Q8)
- "Picker" semantics — a film now wins by vote, not by one person's pick; picker credit and
  voter credit are now separate axes (C7)
- Stats that count "films picked per member" — meaning changes across the era boundary (E12)

**Retires**
- `upcoming_picks` one-per-member-per-month model
- `month_picks_complete` completeness gate + gated auto-activation
- Per-film staggered `scoring_deadline` splitting, and the `enforce-due-deadlines` cron
- Calendar-driven auto-activation (`cron_auto_activate_due_months`, `active_date`,
  `auto_activate`) — progression is people-gated now, not date-gated

---

## 6. Data model sketch (for planning, not final)

New concepts:
- **list / selection round** — themed candidate pool, belongs to a month; has a submission window,
  a state (collecting → voting → watching → closed), and a discard-on-close rule (D9).
- **submission** — 0..2 per member per round; anonymous until reveal; repeatable across rounds (rule 3).
- **ballot** — one per member per vote, carrying an ordered top-3; Borda-scored (A1); re-issued per
  film (A3).
- **watch cycle** — the elected film + the set of members who still need to score it (B4); completion
  unblocks the next round.
- **absence** — admin-set, excludes a member from blocking a cycle (B5).

`movies` stays the film record. `months` stays the container but loses its date-driven activation
machinery (D8 — months start late rather than being forced).

---

## 7. Cutover

- 1.0 stays live until 2.0 is ready; October likely runs manually over text (F13).
- Era boundary at Oct 2026 for stats separability (E12).
- Jan–Sep 2026 history is preserved exactly as-is.
