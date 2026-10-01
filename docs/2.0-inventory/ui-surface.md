## Movie Club 2.0 — Client UI Inventory (src/pages, components, context, lib, App.jsx)

### Headline findings

1. **`month_absences` has zero client references** (grep across `src/`: no matches). The 1.0 admin panel has no "mark absent" UI — B5 is net-new UI, not an adaptation.
2. **Test-account email is inlined in 15 `src/` files (18 sites)** — consistent with §8; the `is_test` refactor rides along with every row below marked `test-account-email-filter`.
3. **The completeness gate is never called from the client.** It lives inside `activate_month`; the client reaches it only through `autoActivateDueMonths()` (`ThisMonth.jsx:58`, no `p_force`) and Admin "Activate now" (`Admin.jsx:326`, `p_force:true`).
4. **The "exactly one active + one upcoming month" invariant is queried with `.eq('status','active').limit(1).maybeSingle()` in 6 places** (`ThisMonth.jsx:1436,1769`, `Home.jsx:260,267`, `Films.jsx:995`, `Admin.jsx:913`). A v2 month with `status='active'` still satisfies these reads — good for R1 — but each page then assumes the active month holds a fixed set of films with deadlines.
5. **Two `GuessThePicker` implementations exist**: the standalone `src/components/GuessThePicker.jsx:22` (used by the film overlay) and an older inline copy at `src/pages/ThisMonth.jsx:89` (used by `FilmCard`). Consolidate before adapting.
6. `GuidedTour.jsx:11-47` hardcodes the 1.0 narrative in copy ("each member picks a film… everyone watches all of them", "picker identities stay secret until the end-of-month reveal").

Vocabulary used below: `one-pick`, `N-films`, `per-film-deadlines`, `cal-auto`, `picker-id`, `month-unit`, `upcoming_picks`, `completeness-gate`, `test-filter`, `none`.

---

### A. App shell, routing, contexts, lib

| Name | Location | What it does | Data | 1.0 assumptions | Verdict |
|---|---|---|---|---|---|
| `AppRoutes` / `RequireAuth` | `App.jsx:99` / `:33` | Routes (`this-month/*`, `films/*`, …), auth gate, retry screen | `users` (via AuthContext) | none | **carry** — route path `this-month` is a label; the page behind it changes |
| `MemberOverlayHost`, `ThemeSync`, `PresencePing` | `App.jsx:123,156,179` | Profile overlay host; DB theme sync; `last_online_at` ping | `users` | none | carry |
| `RevealBus` / `useRevealRefresh` / `useRevealTick` | `lib/useRevealRefresh.js:19,33,44` | Single `'reveals'` broadcast subscription → `mc-reveal` window event | realtime broadcast | none (payload = `{table,id}` on `scores_revealed`/`picker_revealed`/`veto_resubmit_required`/`months.status`) | **carry + extend** — v2 round transitions (collecting→voting→watching→closed, film elected) must also broadcast or pages won't repaint |
| `AuthContext` | `context/AuthContext.jsx:7` | Session + profile, invite claim, retry-once | `users`, rpc `claim_invited_user` | none | carry |
| `NotificationsContext` | `context/NotificationsContext.jsx:69` | Load/realtime/markRead, prefs, push subscribe | `notifications`, `notification_preferences`, `push_subscriptions` | none (type-agnostic) | carry |
| `ReadjustmentContext` | `context/ReadjustmentContext.jsx:21` | Season window state; `isMonthReadjustable(monthId)` via month→season map | `seasons`, `months` | month-unit (film→month→season) | **carry** — v2 films still have a `month_id`, so the mapping survives; verify a drifted/late v2 month is assigned the right `season_id` |
| `ThemeContext`, `TourContext`, `MemberOverlayContext`, `PersonOverlayContext`, `MemberStatsOverlayContext` | `context/*.jsx` | Theme; tour open flag; overlay stacks | localStorage / none | none | carry |
| `AppLayout` | `components/layout/AppLayout.jsx` | Bottom tabs / sidebar incl. "This Month" + Admin | — | none | carry (rename label if page is renamed) |
| `visibility.js` `canSeeScores`/`visibleAvg` | `lib/visibility.js:15,27` | Rolling per-viewer visibility mirror of ratings RLS | — | none | **carry** — B7 (reveal at last score) is just `scores_revealed=true`; helper is unchanged |
| `exportData.js` `gatherUserData` | `lib/exportData.js:56` | Per-member export | `ratings`,`reviews`,`comments`,`movies_safe`(picker),`upcoming_picks`:97,`draft_queue`,`watchlist`,`picker_guesses`,`score_predictions`,`awards` | upcoming_picks, picker-id | **adapt** — add v2 submissions/ballots; keep `upcoming_picks` for v1-era rows |
| `exportData.js` `gatherClubData`/`buildClubCsv` | `:382,456` | Club-wide export | `users`,`months`,`movies_safe`,`ratings`,`reviews`,`comments` | per-film-deadlines (`scoring_deadline` col :386,430,459), picker-id, test-filter | adapt (add round/theme/submitter/voter columns) |
| `colors.js` `MEMBER_COLORS` | `lib/colors.js:9` | Hardcoded 5-name fallback palette | — | none (but 5 fixed names) | **adapt** — Mike (E11) needs an entry or must rely on `user_color` |
| `milestones.js` | `lib/milestones.js` | Club age/anniversaries (pure) | — | none | carry |
| `authLog.js`, `supabase.js`, `avatars.js`, `useBackClose.js`, `useCollapseScroll.js` | `lib/*` | Auth diagnostics; client; avatar lib; back-button stack; collapse scroll | `auth_events` | none | carry |

---

### B. Pages

| Name | Location | What it does | Data | 1.0 assumptions | Verdict |
|---|---|---|---|---|---|
| **Home** `load` | `pages/Home.jsx:247` | Loads active month, all films, my ratings, users, activity, upcoming month | `months`(status active/upcoming), `movies_safe`, `ratings`, `users`, `reviews`, `comments`, `upcoming_picks`:273 | month-unit, upcoming_picks, cal-auto (reminder copy :278-283), test-filter :317 | **adapt** |
| Home "Your Turn" | `:461-523` | `pendingFilms` = active-month films I haven't scored (:418); pick-reminder card (:466); "all caught up / All {month} scores submitted" (:503-504) | — | N-films, one-pick, month-unit | **adapt** — becomes round-state driven: *submit (0/2 in)* → *vote* → *score the elected film* → *waiting on [names]* |
| Home `ActionCard` | `:129` | Score CTA with per-film countdown (:130) | — | per-film-deadlines | adapt (countdown → "club is waiting on you" / who's outstanding) |
| Home poster row + "Your scores" | `:525-603` | Horizontal strip of active films, picker border when revealed (:544), scores list once all scored (:560) | — | N-films, picker-id | adapt (1 film at a time; strip may show the month's elected films so far) |
| Home Club Stats / Milestones / Activity / Members | `:605-794` | Counts, milestones, feed (masks scores per rolling rule :347), member strip | — | test-filter | carry (activity feed could gain "X voted" / "X submitted" events) |
| **ThisMonth** `autoActivateDueMonths` | `pages/ThisMonth.jsx:58` | Client-soft trigger: finds due `upcoming`+`auto_activate` month, calls `activate_month` (gated default) | `months`, rpc `activate_month` | cal-auto, completeness-gate, month-unit | **retire (scope off by mode)** — must not fire for v2 months |
| ThisMonth `PicksTab` | `:1378` | Loads active+upcoming month; reads own `upcoming_picks` by `month_target`; pick CTA w/ deadline note (:1476-1484); predict-nudge via `auth_user_picked_movie_ids` (:1400) | `months`, `upcoming_picks`, `movies_safe`, `score_predictions`, rpc | one-pick, upcoming_picks, cal-auto, picker-id, test-filter :1457 | **adapt → replace** with a Submissions panel (0–2 films, editable until deadline, anonymous) |
| ThisMonth `PickSubmissionFlow` | `:523` | TMDB search → detail+credits+providers enrich → justification → upsert `onConflict:'user_id,month_target'` (:717); draft-queue quick-pick consumed on save (:727); "You can only pick once per month" (:888) | `upcoming_picks`, `draft_queue`, `movies` (already-watched check :621), TMDB | one-pick (unique key), upcoming_picks | **adapt** — the enrichment + search + queue-consumption are reusable; target table and cardinality change (2 rows/member/round) |
| ThisMonth `PickModal`, `PickRow` | `:1315,1614` | Portal modal; own-pick row w/ justification + Change | — | one-pick | adapt (list up to 2) |
| ThisMonth `FilmsTab` / `FilmCard` | `:446,278` | Active films sorted by `scoring_deadline` (:1792); per-card countdown (:390-420), "Picked by" (:421), inline `GuessThePicker` (:437) | `movies_safe`, `ratings` (club avgs :1806) | N-films, per-film-deadlines, picker-id | **adapt** — one "Now Watching" hero card + "who still owes a score" roster; drop countdown |
| ThisMonth inline `GuessThePicker` | `:89` | Older duplicate guess UI on the card | `picker_guesses` | picker-id | **retire** (consolidate into `components/GuessThePicker.jsx`) |
| ThisMonth reveal section | `:1934` | Renders `MonthReveal` for latest `status='revealed'` month | `months` | month-unit | adapt (see MonthReveal) |
| **Films** `loadMovies` | `pages/Films.jsx:2848` | All films; **excludes `upcoming` months** (:2900); `_monthOrder`, `_scores`, `_myScored`; test-filter :2877 | `movies_safe`, `months`, `seasons`, `users`, `ratings` | month-unit, test-filter | **carry** — v2 candidates never become `movies` rows until elected, so no leak; verify a v2 month's status vocabulary is still `active/revealed` |
| Films `sortMovies` / `SORT_OPTIONS` | `:1984,1973` | recent/oldest use `_monthOrder` + **id-within-month = watch order** (:1956-2017); `'picker'` sort groups by `picked_by_user_id` | — | N-films (id order), picker-id | adapt (id order still valid for 1..N sequential v2 films; "By Member" needs submitter semantics) |
| Films `AllFilmsTab` member filter, `PickerLegend` | `:2061-2093`, `:316` | Filter/legend by revealed picker | — | picker-id | adapt (picker → submitter; era-aware label) |
| Films `BySeasonTab`, `VaultTab` | `:2354,2284` | Season grouping; ≥8.5 | — | month-unit (via season) | carry |
| Films `HistoryTab` | `:2579` | Month pills → 2-up grid; recap only for `revealed` months (:2649); id-sorted (:2643) | `months`(active/revealed), `movies_safe`, `ratings`, `month_recaps`, `reviews` | month-unit, N-films (2-up grid layout) | carry, cosmetic adapt (a 1-film month renders fine; drifted months still keyed by `month_year`) |
| **`FilmDetailOverlay`** (shared everywhere) | `:957` | Full film page | `movies_safe`, `ratings`, `users`, `score_predictions`, `months`, rpc `auth_user_picked` :984, `movies` (provider cache write :1104), edge fn `streaming-fallback`, `awards` | see rows below | **adapt** (section-by-section) |
| ↳ Submit Score gate | `:1462` | Shows CTA iff `!myHasFinalScore && (scores_revealed \|\| month_id === activeMonthId)` | — | month-unit | adapt — a v2 "watching" film must qualify (it will if its month is `active`; confirm) |
| ↳ Scores / avg / recommend / breakdown / discussion gate | `:1244-1267, 1511-1611, 1853, 1899` | `canSeeScores`; recommend X/Y of submitters; `CommentThread` locked until scored | — | none | **carry** |
| ↳ Picked By / "Picker revealed at end of month" | `:1759-1798` | Picker + justification once `picker_revealed` | — | picker-id, one-pick | adapt — "Submitted by" (+ voters, C7b); copy no longer "end of month" |
| ↳ `GuessThePicker` mount | `:1801` (`!isPicker && !picker_revealed`) | | | picker-id | adapt |
| ↳ `PickChangeRequestButton` mount | `:1725` (`isPicker && month_id===active && no scores`) | | | one-pick, month-unit | retire in v2 |
| ↳ Veto section (`VetoControl` + `VetoResubmit`) | `:1818-1838` | Pre-score veto | | picker-id, one-pick | retire in v2 (see components) |
| ↳ `PredictionsSection` | `:687` | Picker-only predicts every other member (:688,:871); masked until `picker_revealed` (:745) | `score_predictions` | picker-id, one-pick (exactly one predictor = picker) | adapt — predictor becomes the submitter (or retire if a film can have 2 submitters) |
| **Stats** page shell | `pages/Stats.jsx:4888` | Loads; `_exists` = month not `upcoming` (:5057); `_canSee`; `hasUnseenActive` (:5063); Zack/test filters | `movies_safe`, `ratings`, `users`, `months`, `picker_guesses` | month-unit, test-filter, picker-id (guess accuracy) | carry shell (math out of scope) |
| **Awards** page shell | `pages/Awards.jsx:2696` | Loads `scores_revealed=true` films, monthly/season/annual/all-time tabs | `seasons`,`months`,`movies_safe`,`ratings`,`users`,`picker_guesses` | month-unit, test-filter | carry shell (catalog per G1 out of scope) |
| **Profile** | `pages/Profile.jsx:476` | Own/other profile; stats; recent scores; awards; **"Films X picked"** via `picker_revealed && picked_by_user_id` (:757); notification mute list incl. `month_active/month_reveal/pick_change/veto` (:39-45); prefs; export; PersonalLists | `users`,`ratings`,`movies_safe`,`months`,`seasons`,`awards` | picker-id, test-filter | **carry**; adapt "Films picked" → era-aware "picked / submitted & elected", and mute-list labels |
| **Admin** — see table C | `pages/Admin.jsx:2787` | | | | |
| **Guest** | `pages/Guest.jsx:39` | Reads only `guest_films/guest_scores/guest_reviews` | anon views | none client-side (views bake in `scores_revealed` + "Picked by") | carry (view semantics server-owned) |
| Login / AuthCallback / NotApproved | `pages/*.jsx` | OAuth, callback, pending screen | auth | none | carry |

---

### C. Admin.jsx panels

| Panel | Location | What it does | Data | Assumptions | Verdict |
|---|---|---|---|---|---|
| `expectedMembersList` / `expectedMemberCount` / `isZackPreApril` / `joinedByMonth` | `:29-56` | Who's expected to score a month's film (active, non-test, joined by month, Zack≥Apr) | — | completeness-gate (client twin), test-filter, month-unit | **adapt** — the v2 "who still owes a score" roster is the same computation **minus absences** (which it doesn't read); Mike joins Oct |
| `UpcomingPicksPanel` | `:140` | Admin-only reveal-toggle preview of `upcoming_picks` + historical pickers | `upcoming_picks`, `movies_safe`, `users` | upcoming_picks, picker-id, test-filter :175 | adapt → "candidate pool preview" (submissions, anonymous to members) |
| `MonthActivationPanel` | `:276` | Save `active_date`/`auto_activate`; **"Activate now"** → `activate_month(p_force:true)`; verifies films + deadlines split (:333-346) | `months`, `movies`, rpc | cal-auto, completeness-gate, per-film-deadlines, month-unit | **retire for v2 months / carry for v1** — replace with round controls (open submissions, close & open vote, tally/elect, force-close) |
| Dashboard "Active Month" + watch-order reorder | `:913-1046` | `N films`, `x/N deadlines set`; reorder by **swapping `scoring_deadline`** (:949) | `movies` | N-films, per-film-deadlines | retire for v2 (order = election order) |
| `DeadlineGracePanel` | `:768` | `app_settings.deadline_grace_days` | `app_settings` | per-film-deadlines | retire/scope-off |
| Missing-scores list + back-calc | `:872-946, 1075` | Expected vs actual per film; back-calc single missing score | `ratings` | completeness-gate twin, test-filter | **carry** (this *is* the v2 gate's admin view) |
| `SeasonReadjustmentPanel` | `:481` | Open/close/auto windows, length | `app_settings`, `seasons` | month-unit (season boundary) | carry |
| `AiRecapPanel` | `:618` | Auto/force `ai-recap` per active/revealed month | `month_recaps`, edge fn | month-unit, N-films (prompt is per-month) | adapt (recap per month still OK with 1..N films; edge fn out of scope) |
| `VetoThresholdPanel` | `:733` | `app_settings.veto_threshold` | `app_settings` | none | retire/scope-off with veto |
| `ClubExportPanel` | `:803` | Club export | via lib | see lib | adapt |
| `ScoreChangeRequestsAdminPanel` / `PickChangeRequestsAdminPanel` mounts | `:1144,1152` | | | | carry / retire |
| `triggerAwardsWrite` | `:1162` | Client-soft awards upsert | `movies_safe`,`ratings`,`users`,`months`,`seasons`,`picker_guesses`,`awards` | picker-id | carry (awards lib owns semantics) |
| `FilmsTab` | `:1202` | Edit metadata + `scoring_deadline` (:1248,1302) + `scores_revealed`/`picker_revealed` toggles; `bulkReveal` by month (:1524); TMDB backfill (:1490); provider refresh | `movies` | per-film-deadlines, picker-id, month-unit | carry; hide deadline field for v2 films |
| `MembersTab` / `InviteCard` | `:2114,1974` | Edit/activate/deactivate/roles; invite (Mike) | `users` | none | **carry** — **no absence control here** (B5 is new) |
| `ScoresTab` | `:2365` | Backfill matrix (expected users per month) | `ratings` | completeness-gate twin, test-filter :2396 | carry |
| `AssetsTab` | `:2638` | Custom avatars | `custom_avatars`, storage | none | carry |

---

### D. Components

| Name | Location | What it does | Data | Assumptions | Verdict |
|---|---|---|---|---|---|
| `MonthReveal` | `components/MonthReveal.jsx:54` | Per-film reveal cards: picker+justification, per-member scores, guess results, **picker's predictions** (`predicting_user_id === picked_by_user_id` :204), AI recap + Best Review | `movies_safe`, `ratings`, `picker_guesses`, `score_predictions`, `month_recaps`, `reviews` | month-unit, N-films, picker-id, one-pick | **adapt** → per-film "cycle reveal" (submitter + voters/ballots + Borda tally, C6b/C7b); month recap stays |
| `GuessThePicker` | `components/GuessThePicker.jsx:22` | Select one member; delete-then-insert; post-reveal results | `picker_guesses` | picker-id (exactly one picker; candidates = all-but-me), test-filter | **adapt** — "who put this on the list?"; with 0–2 submissions and repeat submissions the correct answer can be a *set* → schema + scoring change |
| `PickChangeRequest` (button + admin panel) | `components/PickChangeRequest.jsx:40,180` | Locked active pick swap w/ zero-score guard | `pick_change_requests`, `ratings`, `movies`, TMDB | one-pick, month-unit, picker-id, test-filter | **retire (scope off)** — rule 6 lets members edit submissions freely before deadline; an elected film isn't one member's to swap |
| `VetoControl` | `components/VetoControl.jsx:10` | Toggle veto; "X of N members" (:215) | `veto_votes`, `app_settings` | none structurally, but semantically collides with Borda election | **retire/scope off** (flag: decision needed — veto of an *elected* film?) |
| `VetoResubmit` | `components/VetoResubmit.jsx:49` | Picker swaps vetoed film via `resubmit_vetoed_pick` | rpc, TMDB | picker-id, one-pick | retire/scope off |
| `ScoreModal` | `components/ScoreModal.jsx:17` | Excitement → final; bold-confirm; recommend; readjust mode; tags | `ratings` | none (excitement gated on `!scores_revealed`, readjust via month→season) | **carry** — under B4 this is the "I've watched it" signal; consider copy "this unblocks the club" |
| `ScoreChangeRequest` (button + admin) | `components/ScoreChangeRequest.jsx:61,405` | Request/approve score change | `score_change_requests`, `ratings` | test-filter | carry |
| `CommentThread` | `components/CommentThread.jsx:42` | Threads, reactions, votes, mentions, realtime | `reviews`,`comments`,`reactions`,`votes` | test-filter | carry |
| `NotificationCenter` | `components/NotificationCenter.jsx:398` (`TYPE_META` :42) | Bell + panel; glyphs for `scores_revealed, month_reveal, month_active, reply, mention, score_change, late_score, deadline_soon, pick_change, veto` | via context | none (unknown types fall back :54) | carry + add v2 types (`round_open`, `vote_open`, `film_elected`, `waiting_on_you`) |
| `PersonalLists` (watchlist + draft queue) | `components/PersonalLists.jsx:433` | Private lists; queue feeds pick flow | `watchlist`, `draft_queue` | none | carry (queue → submission quick-pick) |
| `GuidedTour` | `components/GuidedTour.jsx:49` | Onboarding carousel; copy at :11-47 | `users.has_completed_onboarding` | one-pick, N-films, picker-id (copy only) | adapt copy (era/mode-aware) |
| `PersonOverlay`, `MemberStatsOverlay`, `FilmTags`, `FilmScoreBars`, `AwardsBadges`, `Avatar`, `AvatarPicker`, `ReadjustmentBanner`, `ScrollRestorer` | `components/*` | Person filmography; member full stats (reads `picker_guesses` :55); tags; μ/σ bars; badge grid; avatars; banner; scroll | `movies_safe`, `film_tags`, `custom_avatars`, … | test-filter (MemberStatsOverlay, FilmTags) | carry |

---

### E. Every client site assuming N films/month or exactly one pick/member

| Assumption | Sites |
|---|---|
| **one-pick** | `ThisMonth.jsx:566` (`maybeSingle` on own pick), `:717` (`onConflict user_id,month_target`), `:888` (copy), `:1490` (`myPick = find`), `Home.jsx:273` (`maybeSingle`), `MonthReveal.jsx:204` (predictor = picker), `Films.jsx:688/871` (picker predicts all others), `Films.jsx:984` (`auth_user_picked` boolean), `exportData.js:89` |
| **N-films** | `ThisMonth.jsx:450` (4 skeletons), `:1792` (sort by deadline), `Home.jsx:290,418,504,560` ("All … scores submitted" after N), `Admin.jsx:913-1046` (N films / deadlines set / reorder), `Films.jsx:1956-2017` (id = watch order), `HistoryTab` 2-up grid, `AiRecapPanel` (per-month) |
| **per-film-deadlines** | `ThisMonth.jsx:23,389-420`, `Home.jsx:116,130`, `Admin.jsx:335,339,915,949-957,1241-1305,1703,1871`, `DeadlineGracePanel :768`, `exportData.js:386,430,459` |
| **cal-auto** | `ThisMonth.jsx:58-74,1438,1476-1484`, `Home.jsx:267,278`, `Admin.jsx:276-348,2837` |
| **picker-id (single picker)** | `ThisMonth.jsx:114-119,280,490`, `Home.jsx:544`, `Films.jsx:316-385,404,1277,1759-1815,2001-2008,2061-2093,2482`, `MonthReveal.jsx:180-256`, `GuessThePicker.jsx` (all), `Profile.jsx:757-761`, `UpcomingPicksPanel :163-178`, `MemberStatsOverlay.jsx:55`, `Stats.jsx:4933,4996` |

---

### Top 10 hardest UI adaptations for 2.0

1. **ThisMonth page rewrite as a round-state machine** (`ThisMonth.jsx:1744`): Submissions (0–2, editable, anonymous) → Ballot (top-3 drag/rank, Borda) → Now Watching (one hero film + outstanding-scorer roster) → Cycle reveal → repeat within the month. Nothing in the current page maps 1:1.
2. **Home "Your Turn" becomes people-gated, not film-gated** (`Home.jsx:418-523`): four distinct states (submit / vote / score / waiting on X) replace "pending films", and the pick-reminder copy (`:278`) that quotes `active_date` must go.
3. **Picker → submitter + voters everywhere** (`Films.jsx:1759`, `MonthReveal.jsx:180`, `Profile.jsx:757`, `PickerLegend :316`, member filter `:2091`, `UpcomingPicksPanel`): one identity axis becomes two (C7), both revealed at last-score (C6b/C7b), and era-aware labels are needed because "picked" means different things before/after Oct 2026.
4. **Guess-the-picker when the answer can be a set** (`GuessThePicker.jsx:22`, plus the duplicate at `ThisMonth.jsx:89`): a film may have 1–2 submitters (and re-submitters across rounds); the single-select + `=== picked_by_user_id` correctness check and the `picker_guesses` shape need a decision.
5. **Predictions** (`Films.jsx:687`, `MonthReveal.jsx:204`): "the picker predicts everyone else" has no clean owner when the club elects the film; either the submitter(s) predict or the feature is scoped off — and the elimination-leak masking (`:745`) must be re-proven against the new reveal moment.
6. **Admin round controls replace `MonthActivationPanel`** (`Admin.jsx:276`): open/close submissions, open vote, tally (with random tie-break, rule 9), force-elect, plus a **net-new absence control** (B5) — no `month_absences` UI exists anywhere in `src/`.
7. **Scoping off cal-auto and deadline machinery without deleting it** (`ThisMonth.jsx:58` client trigger, `Admin.jsx:768` grace, `:949` reorder-by-deadline, `FilmsTab :1248` deadline field, `Home.jsx:130` countdown): every one needs a `mode==='v1'` guard so R1 revert is a flag flip.
8. **`RevealBus` coverage of v2 transitions** (`lib/useRevealRefresh.js:19`): pages refetch only on `scores_revealed`/`picker_revealed`/`months.status` broadcasts; round state changes (vote opened, film elected) need new broadcast events or the UI goes stale for everyone but the actor.
9. **Notification vocabulary** (`NotificationCenter.jsx:42`, `Profile.jsx:39-45`): `deadline_soon`/`late_score`/`month_active`/`pick_change`/`veto` are 1.0 concepts; v2 needs `round_open`/`vote_open`/`film_elected`/`waiting_on_you` types with mute rows and glyphs — and "late score" semantics invert (there's no deadline to be late for).
10. **Copy and onboarding debt** (`GuidedTour.jsx:11-47`, `ThisMonth.jsx:478,888`, `Films.jsx:1795`, `Home.jsx:536`): a dozen hardcoded strings narrate the 1.0 lifecycle ("pick once per month", "picker revealed at end of month", "no picks yet for …") and must become mode-aware so a reverted app doesn't read as 2.0 and vice-versa.
