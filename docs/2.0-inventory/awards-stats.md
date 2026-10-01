I have everything needed. Here is the report.

# Awards & Stats audit for Movie Club 2.0

## How the catalog is wired (context for every verdict)

- All awards are computed at runtime by four functions in `src/pages/Awards.jsx` — `computeMonthlyAwards` (:1099), `computeSeasonAwards` (:576), `computeAnnualAwards` (:864), `computeAllTimeAwards` (:1283) — plus the shared TMDB-relative helper `computeTmdbAwards` (:168). `src/lib/awards.js` wraps them: `MONTHLY/SEASON/ANNUAL/ALLTIME_DEFS` (:45-109) map compute fields to `award_key`s; `computeAllAwardRecords` (:141-217) loops every month/season/year; `writeAwardsToDb` (:344-377) upserts on `(award_key, scope, period_ref)`. The `awards` table predates migration tracking (`supabase/migrations/README.md:9`); it is written only from Admin (`src/pages/Admin.jsx:1162` `triggerAwardsWrite`, called on admin reveals and dashboard mount) and read by Profile/Films via `fetchAwardsForFilm/User` (awards.js:308, 324).
- "Picker" enters everywhere through `movies.picked_by_user_id` gated on `picker_revealed` (awards.js:131-137; Awards.jsx:633-638, 920-925, 1346-1351). Every **film** award is also attributed to its picker (`pickerUserId`, awards.js:166) so it shows on that member's profile.
- Guess data: `picker_guesses` loaded at Awards.jsx:2760 and Stats.jsx:4995-4998.
- Stats data layer (Stats.jsx:4966-5060): `movies_safe` (+`picked_by_user_id`), all `ratings`, active `users`, `months(status)`. Two viewer-relative flags drive visibility: `_canSee` (revealed or self-scored) and `_exists` (month status ≠ upcoming) at :5053-5060. 2.0 months must keep `months.status` and `scores_revealed` semantics coherent or these flags silently blank charts.
- **Per-film deadlines are never read by awards or stats** — nothing in scope depends on `scoring_deadline`. Watch order in the film trend uses `id ASC` within a month (Stats.jsx:3666), which stays correct for sequential 2.0 films.

Assumption vocabulary below: **NF** = N-films-per-month, **PI** = picker-identity, **MU** = month-as-unit, **PD** = per-film-deadlines, **none**.

---

## Part A — Awards

### Monthly scope (`computeMonthlyAwards`, Awards.jsx:1099-1281; defs awards.js:45-57; cards :1604-1760)

| Key | Loc | Computes | Min data | 1.0 assump. | Verdict @1-2 films |
|---|---|---|---|---|---|
| pick_of_month | :1134-1138 | highest club-avg film in month | ≥1 scored film | NF, MU | **DEGENERATE** — at 1 film the only film "wins"; at 2 it's a coin flip. Retire-tier; the film's club avg already says this. |
| flop_of_month | :1142-1145 | lowest avg, nulled if same as pick | ≥2 films | NF, MU | **DEGENERATE** — always null at 1 film; at 2 it's "the other one". Retire. |
| oracle | :1166-1183 | member with lowest avg \|excitement − film avg\| | ≥1 rating w/ excitement | MU (N films smooth it) | **Adapt → per-film** "closest pre-watch call". Meaningful per film. NB: `AWARD_INFO` :30 describes it as picker *predictions*, but the code uses excitement — pre-existing label/code mismatch. |
| hype_machine | :1186-1199 | highest avg excitement | ≥1 excitement | MU | **Adapt → per-film** "most hyped member" (thin); or fold into voter award (see shortlist). |
| letdown | :1202-1211 | film with most negative (final − excitement) | ≥1 film with both | NF | **DEGENERATE** — no same-film guard (unlike flop): at 1 film the same film is both Letdown *and* Surprise. Adapt to a per-film signed threshold badge (e.g. gap ≤ −1.0). |
| surprise | :1214-1220 | most positive gap | same | NF | **DEGENERATE** — same. Adapt with threshold (≥ +1.0). |
| most_divisive | :1223-1230 | highest σ (≥2 scores) | ≥1 film | NF | **DEGENERATE** — the one film is both most divisive and most unanimous. Adapt to σ-threshold badge, or keep only at season+. |
| most_unanimous | :1233-1239 | lowest σ | same | NF | **DEGENERATE** — same. |
| contrarian | :1244-1259 | member with highest avg \|score − film avg\| | ≥1 score | MU | **Adapt → per-film "The Outlier"** — who disagreed most with the room on this film is genuinely interesting per film. |
| the_underrated | :168-181 (via :1262) | max positive (club − TMDB) gap | ≥1 scored film w/ `tmdb_vote_average` | NF (gap>0 guard) | **Adapt** — at 1 film it degrades to "did we beat TMDB?"; fine as a per-film badge with a threshold (e.g. ≥ +1.0). |
| the_deep_cut | :183-222 | max genre-rarity + obscurity | ≥1 film w/ genre+vote_count | NF | **DEGENERATE** — always the lone film. Retire at monthly (keep season+) or add a uniqueness threshold. |

Split impact: no monthly award reads picker identity directly, but every *film* award is attributed to `pickerUserId` (awards.js:166) → becomes the **submitter** in 2.0, which is sensible ("your submission was The Outlier's film" is odd; "your submission entered the Vault" is good). Also: awards.js:177-183 runs the monthly loop for **every** month with revealed films — v2 months must be scoped out per key, and because the upsert never deletes rows (:372-374), any degenerate rows written once persist on profiles forever.

### Season scope (`computeSeasonAwards`, :576-860; defs awards.js:60-76)

| Key | Loc | Computes | Min data | Assump. | Verdict |
|---|---|---|---|---|---|
| film_of_season | :618-622 | highest avg (≥2 scores) | ≥1 film | none | **Carry** (3-6 films/season vs 12-15, still meaningful). |
| flop_of_season | :626-629 | lowest, ≠ film of season | ≥2 films | none | **Carry**, thin — a 2-film season (month drift, D8) makes it "the other one". |
| picker_of_season | :641-658 | best avg of picked films (≥1) | PI | PI | **Adapt/BREAKS on split** → "Submitter of the Season" = whose *elected* submission scored best. Selection bias (only winners get scored) and most members will have 0-1. Replace with voter-aware Curator award (below). |
| season_auteur | :664-680 | best picker, ≥2 scored picks, post-readjustment | PI | PI | **DEGENERATE** — ≥2 winning submissions in a 3-6 film season is rare; most seasons yield no Auteur. Move to annual, or re-base on submissions + Borda points. |
| ice_cold | :683-700 | lowest avg of picked films | PI | PI | **Adapt** (inverse of picker_of_season); thin for the same reason. |
| season_consistent_picker | :703-718 | lowest σ of pick avgs (≥2) | PI | PI | **DEGENERATE** — same ≥2 problem. Retire at season. |
| season_divisive / season_unanimous | :721-737 | highest/lowest σ (≥3 scores) | ≥1 film | none | **Carry**. |
| season_harshest / season_generous | :752-779 | lowest/highest avg given | ≥1 score | none | **Carry**. |
| season_easy_crowd | :784-798 | fewest ≤6.0 scores (≥2), tiebreak avg | ≥2 scores | none | **Carry**. |
| season_contrarian | :801-817 | highest avg \|score − avg\| | ≥1 | none | **Carry**. |
| season_oracle | :820-836 | lowest avg \|excitement − avg\| | ≥1 excitement | none | **Carry** (same label mismatch). |
| season_underrated / season_deep_cut | :839-841 | TMDB-relative | ≥1 | none | **Carry**. |

### Annual scope (`computeAnnualAwards`, :864-1097; defs awards.js:79-93; glance tiles :2455-2458)

| Key | Loc | Computes | Min data | Assump. | Verdict |
|---|---|---|---|---|---|
| film_of_year / worst_film_of_year | :908-917 | highest / lowest (≥2 scores) | ≥1-2 films | none | **Carry**. |
| picker_of_year | :920-939 | best avg of picked films (≥1) | PI | PI | **Adapt/BREAKS** → Submitter of the Year. 2026 is a mixed-era year (Jan-Sep picks + Oct-Dec elected) — "films you brought to the club" is arguably comparable (E12 combine), but label it. |
| annual_harshest / annual_generous | :951-960 | avg given | ≥1 | none | **Carry**. |
| annual_divisive | :1041-1048 | highest σ (≥3) | ≥1 | none | **Carry**. |
| annual_oracle | :1051-1070 | excitement accuracy | ≥1 | none | **Carry**. |
| annual_most_consistent | :963-970 | lowest own-score σ (≥3) | ≥3 scores | none | **Carry**. |
| annual_wildcard | :973-988 | highest avg deviation (≥3) | ≥3 | none | **Carry**. |
| annual_master_of_disguise | :1019-1038 | picker guessed correctly least (≥3 guesses) | PI + `picker_guesses` | PI | **Adapt** → "submitter guessed least" (guess-the-submitter, C6b). One elected film = 5 guesses, so the ≥3 bar is met. Only if the guess game carries. |
| annual_most_evolved | :992-1015 | avg shift 1st vs 2nd half of ≥8 distinct months | ≥8 months | MU | **Adapt** — months drift/sparse in 2.0; split halves by film count instead of month count. |
| annual_underrated / annual_deep_cut | :1073-1075 | TMDB-relative | ≥1 | none | **Carry**. |
| Glance tiles: Films Watched, Scores Cast, Club Avg, In the Vault | :2455-2458 | counts | — | none | **Carry**. |

### All-time scope (`computeAllTimeAwards`, :1283-1496; defs awards.js:96-109)

| Key | Loc | Computes | Min data | Assump. | Verdict |
|---|---|---|---|---|---|
| greatest_film / worst_film | :1314-1323 | highest/lowest (≥2 scores) | ≥1-2 | none | **Carry**. |
| divisive_ever / unanimous_ever | :1326-1342 | σ extremes (≥3) | ≥1 | none | **Carry**. |
| picker_goat | :1354-1366 | % of picks with avg ≥ 7.0 — **no minimum pick count** | PI | PI | **Adapt/BREAKS** → submitter. Pre-existing weakness: one 7+ winning submission = 100% and beats a 5/6 record (strict `>` keeps first found). Add min count; combine eras as "films brought". |
| coldest_critic / biggest_softie | :1432-1449 | avg given | ≥1 | none | **Carry**. |
| wildcard_alltime | :1454-1462 | highest avg deviation | ≥1 | none | **Carry**. |
| oracle_alltime | :1467-1475 | excitement accuracy | ≥1 | none | **Carry**. |
| master_of_disguise_alltime | :1370-1389 | as annual | PI + guesses | PI | **Adapt** (as annual). |
| alltime_underrated / alltime_deep_cut | :1478-1480 | TMDB-relative | ≥1 | none | **Carry**. |

### Cross-cutting award findings

1. **Picker → submitter is a rename plus a semantics change**, not a break, *if* 2.0 stores the submitter in `movies.picked_by_user_id`. Every PI award then "works" but its meaning shifts from "curation" to "won the vote" (selection-biased). Decision needed: if two members can submit the same film in one round (rule 3 says only across rounds, but not excluded within one), a single column can't hold two submitters.
2. **Join-date eligibility is hardcoded by name** for Zack (Awards.jsx:228-236, 255-269; Stats.jsx:914-921). Mike (E11) joins at the era boundary and needs the same rule — generalise on `users.joined_at`.
3. **Stale-row hazard**: `writeAwardsToDb` upserts and never deletes (awards.js:372-374); retiring monthly keys or nulling winners leaves old rows visible via `fetchAwardsForUser`. Scope the monthly loop by `months.mode` and delete rows for retired keys on v2 periods.
4. "Picker" wording in `AWARD_INFO` (:36-40) and card labels needs the rename.

---

## Part B — Stats (`src/pages/Stats.jsx`)

### Overview tab (`OverviewTab` :1187-1579)

| Stat | Loc | Shows | Source | Assump. | Verdict |
|---|---|---|---|---|---|
| Total Films / Scores Cast / Club Average / In the Vault | :1375-1378 | counts, mean | `_canSee` movies, ratings | none | **Carry**. |
| All-Time Score Distribution | :1383-1386 (`ScoreHistogram` :103) | 10-bin histogram | ratings | none | **Carry**. |
| Member Averages | :1392-1404 (`ComparisonBar` :450) | avg given per member | ratings | none | **Carry**. |
| Avg Score of Their Picks | :1411-1423 (calc :1298-1306) | mean club-avg of films each member picked | `picked_by_user_id`+`picker_revealed` | PI | **Adapt + era split** → "avg score of their elected submissions"; 2.0 values are vote-filtered so not directly comparable with 1.0 curation. |
| The Vault strip | :1429-1491 | films ≥ 8.5 | `historical_avg`/ratings | none | **Carry**. |
| Most Divisive / Most Unanimous / Highest / Lowest Rated (+ expandable `MemberScoreBars` :204) | :1495-1575 (calc :1250-1276) | all-time film extremes | ratings (≥3 / ≥2 scores) | none | **Carry** — all-time comparisons, unaffected by films-per-month. |

### Me tab (`MeTab` :1583-2116; also reused by `MemberStatsOverlay`)

| Stat | Loc | Shows | Source | Assump. | Verdict |
|---|---|---|---|---|---|
| Films Scored / Avg / Excitement Avg / Would Recommend / Std Dev / Granularity | :1822-1830 | tiles | own ratings | none | **Carry** (excitement conditional on open question 4). |
| Score Distribution | :1837-1841 | histogram | own ratings | none | **Carry**. |
| You vs Club Average | :1845-1854 | 2-bar | own vs all ratings | none | **Carry**. |
| Scoring Trend · Avg Per Month | :1859-1867 (calc :1645-1657, `MonthLineChart` :260) | avg of own scores per month | month_id → month_year | MU | **DEGENERATE** — at 1-2 films the "monthly average" is the film's score, and months drift (D8). Replace with per-round or rolling-N average, or drop (Scores Over Time already covers it). |
| Scores Over Time | :1871-1887 (calc :1662-1686) | one point per film, month tick labels | own ratings, month_year, submitted_at | MU (labels only) | **Carry** — per-film already; 2.0 `submitted_at` is reliable, sort still correct. |
| Excitement vs Final (scatter) | :1891-1899 (`ExcitementScatter` :402) | per-film | own ratings | none | **Carry**. |
| Generosity Percentile | :1903-1918 | rank of own avg among members | all ratings | none | **Carry**. |
| Guess-the-Picker Accuracy | :1922-1937 (calc :1585-1596) | correct guesses / revealed films | `picker_guesses`, `picked_by_user_id`, `picker_revealed` | PI | **Adapt** → guess-the-*submitter*; works unchanged if submitter lives in the same column and reveals per C6b. Combinable across eras (same game). |
| Picks by Genre (donut) | :1941-1949 (calc :1713-1723, `DonutChart` :500) | genres of films this member picked | `picked_by_user_id === subjectId` | PI | **Adapt + era split** — in 2.0 the better signal is *all submissions* (incl. losers) from the new submissions table; that is richer than 1.0. Label as "Submissions by Genre" for v2. |
| Taste · Avg Score by Genre | :1953-1967 | own avg per genre | own ratings + genre | none | **Carry**. |
| Season / Year Rankings | :1971-1995 (calc :1742-1769, `seasonForMonthYear` :902) | own films ranked per season/year | month_year | MU (season derived from month label) | **Carry** — month drift keeps a month_year label; lists get short (3-6 films/season) but stay valid. |
| Top 5 / Bottom 5 | :1999-2015 | own extremes | own ratings | none | **Carry**. |
| Excitement vs Final list | :2019-2112 | per-film pairs | own ratings | none | **Carry**. |

### Members tab (`MembersTab` :2327-2671)

| Stat | Loc | Shows | Assump. | Verdict |
|---|---|---|---|---|
| Card: films scored, Avg | :2491, :2515 | per member | none | **Carry**. |
| Excitement Avg / Would Recommend | :2543-2560 | per member | none | **Carry**. |
| Highest / Lowest film | :2564-2593 | per member | none | **Carry**. |
| Expanded: Std Dev, Granularity | :2613-2630 | per member | none | **Carry**. |
| Expanded: Score Distribution | :2633-2642 | histogram | none | **Carry**. |
| Expanded: Scores Over Time | :2645-2663 (calc :2385-2405) | per-film points, month labels | MU (labels) | **Carry**. |
| "View full stats" → `MemberStatsOverlay` | :2599-2611 | reuses `MeTab` | — | inherits Me verdicts. |

### Club tab (`ClubTab` :3439-4467)

| Stat | Loc | Shows | Source | Assump. | Verdict |
|---|---|---|---|---|---|
| Score Over Time · Club vs Members — **month** mode | :3937-3949 (calc :3477-3489, :3633-3656; `ClubTrendChart` :2703) | per-month club avg + member avgs + TMDB | month_id | MU | **DEGENERATE** at 1-2 films — month avg ≈ one film. Keep **film** mode as the only/primary mode, or re-key on rounds. |
| — **film** mode (default) | :3951-3970 (calc :3662-3691) | per-film club avg + each member, watch order by `id` | ratings, `_canSee` | none | **Carry**. |
| All-Time Score Distribution | :3977-3981 (calc :3703-3707) | histogram | ratings | none | **Carry**. |
| Club vs TMDB | :3985-3993 (`ClubVsTmdbChart` :2794; calc :3845-3852) | scatter | `tmdb_id`, `tmdb_vote_average` | none | **Carry**. |
| Average Score by Decade | :3997-4017 (calc :3793-3805) | bars | `year_released` | none | **Carry**. |
| Scoring Granularity | :4021-4053 (calc :3808-3817) | per member | ratings | none | **Carry**. |
| Scoring Variation · Std Dev | :4057-4078 (calc :3820-3829) | per member | ratings | none | **Carry**. |
| Per-Film Score Spread | :4082-4152 (calc :3834-3840) | μ/σ per film, sorted | ratings (≥2) | none | **Carry**. |
| Picker Power Rankings | :4156-4194 (calc :3739-3754) | avg score of films each member picked, count | `picked_by_user_id`+`picker_revealed` | PI | **Adapt + era split** → "Submitter rankings" (avg of elected submissions). Better 2.0 replacement: submission win-rate / Borda points earned (no selection bias). |
| Given vs Received vs Club Avg | :4199-4229 (`calcGivenVsReceived` :2317-2323; :3726-3736) | avg given vs avg received on own picks | PI | PI | **Adapt + era split** — "received" becomes score on own elected submissions. |
| Per-Member Score Spread (box plot) | :4233-4254 (`BoxPlotChart` :643, `quartiles` :809) | IQR/median/mean | ratings (≥2) | none | **Carry**. |
| Score Percentile (Generosity) | :4259-4271 (`PercentileBar` :740; calc :3782-3788) | rank of member avgs | ratings | none | **Carry**. |
| Taste Correlation heatmap | :4276-4288 (`CorrelationHeatmap` :680; calc :3757-3779) | pairwise Pearson (≥3 shared) | ratings | none | **Carry**. |
| Genre Blindspot Grid | :4294-4309 (`GenreBlindspotGrid` :2895; calc :3566-3608) | member × genre count of films PICKED | `picked_by_user_id`, `_exists` | PI | **Adapt + era split** — count *submissions* per genre in 2.0 (the intended "curation blindspot" signal, and richer than winners-only). |
| Most Active Scorer | :4313-4340 (calc :3492-3502) | most scores submitted | ratings | none | **Carry** (already ≈ tenure since everyone scores everything; era-neutral). |
| Scoring Streaks | :4344-4384 (`calcScoringStreaks` :2261-2277; :3505-3518) | consecutive months with ≥1 score | month_id | MU | **DEGENERATE** — rule 1 means nobody can skip a film, so streak = tenure. Retire, or re-base on rounds ("consecutive films scored before the round stalled" / "never the last to score"). |
| Most Picked Genres (donut) | :4389-4399 (calc :3522-3536) | films per genre, existence-based | `_exists` movies | none (wording only) | **Carry**, rename to "Most Watched Genres"; optional 2.0 twin "Most Submitted Genres". |
| Avg Score by Genre | :4403-4419 (calc :3542-3554) | club avg per genre | ratings + genre | none | **Carry**. |
| Excitement vs Reality | :4423-4460 (calc :3611-3618) | avg excitement vs avg final | ratings | none | **Carry**. |
| Connection Web · 6 Degrees (+ "Not yet connected") | :4463 (`ConnectionWeb` :3084, `buildConnectionGraph` :3011; movies via `_exists` :3448) | shared actor/writer/director graph | `tmdb_cast`, `tmdb_writers`, `director` | none | **Carry** — depends only on `months.status ≠ upcoming` (:5057); v2 months must set status coherently. |

### Head to Head tab (`HeadToHeadTab` :4516-4882)

| Stat | Loc | Shows | Assump. | Verdict |
|---|---|---|---|---|
| Avg Disagreement | :4657-4671 (`calcAgreementScore` :2229-2241) | mean \|A − B\| over shared films (≥3) | none | **Carry**. |
| Scoring Comparison | :4675-4708 | avg A vs avg B | none | **Carry**. |
| Head to Head Record | :4713-4769 (`calcHeadToHeadRecord` :2281-2301) | wins/ties per film | none | **Carry**. |
| Taste Correlation | :4775-4793 | Pearson (≥3) | none | **Carry**. |
| Score Delta Per Film | :4797-4817 | signed bar per film (top 18) | none | **Carry**. |
| Most Agreed / Most Disagreed On | :4821-4877 | top-3 each | none | **Carry**. New 2.0 twin: ballot agreement between two members (rank correlation of their top-3s). |

Also carried unchanged: `FilmScoreBars` (`src/components/FilmScoreBars.jsx:45`, per-film member bars in the film overlay) — per-film, no 1.0 assumptions.

---

## (1) Proposed monthly shortlist at 1-2 films/month

Reframe the tier as **per-film / per-round awards** (the film is the 2.0 unit), each with an explicit threshold so a lone film isn't crowned by default:

**Surviving (adapted):**
1. **The Outlier** (from `contrarian` :1244) — member furthest from the club average on this film. Meaningful with one film.
2. **The Oracle** (from `oracle` :1166) — member whose pre-watch excitement was closest to the club average. Fix the description at :30.
3. **Expectation Gap badge** (merge `letdown`/`surprise` :1202-1220) — awarded only when |avg final − avg excitement| ≥ ~1.0, signed Letdown/Surprise.
4. **Divisive / Unanimous badge** (from :1223-1239) — σ ≥ ~1.5 → Divisive, σ ≤ ~0.5 → Unanimous; otherwise no award.
5. **The Underrated badge** (from :168) — club − TMDB ≥ ~+1.0 only.

**Retire at monthly** (keep at season+): Pick/Flop of the Month, Deep Cut, Hype Machine (or fold into #7).

**New, exploiting submitter/voter data (C7/C7b):**
6. **Kingmaker** — per film: members whose #1-ranked ballot entry won (needs ballots + elected film). Simple, fires every round.
7. **Buyer's Remorse / Won Over** — per film: biggest negative gap between ballot rank and final score (ranked it #1, scored it lowest) and its inverse (left it off the ballot, scored it highest). This is the voter-era version of Letdown/Surprise at the member level.
8. **Pacesetter** — per film: first member to submit a score (progression is people-gated, B4; `submitted_at` is now reliable). Optionally the gentler counterpart of a "last to score" shame stat — recommend skipping the shame.
9. **Curator's Win Rate** (season/annual/all-time; replaces Picker of the Season/GOAT/Auteur) — elected ÷ submitted, plus total Borda points earned per submission. Removes the selection bias that makes the picker awards degenerate; also yields **Bridesmaid** (most Borda points without a win).
10. **Contrarian Voter** (season+) — member whose ballots correlate least with the final tally (rank correlation vs Borda order).
11. **Never Say Die** (all-time) — same `tmdb_id` resubmitted the most rounds before winning (rule 3 / D9).

## (2) Stats needing an era split (E12)

Everything keyed on `picked_by_user_id` changes meaning from "curated" to "won the vote": **Avg Score of Their Picks** (Stats.jsx:1298), **Picks by Genre** (:1713), **Picker Power Rankings** (:3739), **Given vs Received** (:3726), **Genre Blindspot Grid** (:3566); plus the awards **Picker of the Season/Year, Picker GOAT, Auteur, Ice Cold, Most Consistent Picker, Master of Disguise** (Awards.jsx:641-718, 920-939, 1019-1038, 1354-1389). Show 1.0 and 2.0 separately (or 2.0 as "submissions", which is richer), and only combine as "films brought to the club".

Month-as-unit stats that go **degenerate** rather than split: **Scoring Trend · Avg Per Month** (:1645), **Club trend month mode** (:3477), **Scoring Streaks** (:2261), **Most Evolved** (Awards.jsx:992). Wording-only: **Most Picked Genres** (:4389), **Guess-the-Picker** (:1922). Also generalise the name-hardcoded join-date exclusion (Stats.jsx:914-921, Awards.jsx:228-269) to `users.joined_at` before Mike joins at the boundary.
