# Avatar Library — Generation Guide (Midjourney)

End-to-end runbook for producing the 18-pack avatar library (~91 fixed icons + Pack 18
which grows monthly). Spec style: **consistent flat cartoon**. Source of truth for the
pack list: Drive `MOVIE_CLUB_SPEC-11.txt` (mirrored into `MOVIE_CLUB_SPEC.md`).

> **Why per-icon, not grids?** Midjourney is flat-rate subscription, so generating 91
> individual icons costs the same as 9 grids — and per-icon output is one clean image
> with no fragile grid-slicing. We use **one icon per prompt** + a locked `--sref` style
> reference for consistency. (Grid method kept in the Appendix for the cheapest plan.)

---

## Pipeline at a glance

```
subscribe → lock a STYLE ANCHOR → per-icon prompts (same --sref) → upscale
        → process script (cut out bg, trim, square, 256px WebP) → public/avatars/<pack>/<id>.webp
        → src/lib/avatars.js manifest → (hand back to Claude to wire the UI)
```

---

## Step 0 — Plan & cost

- **Basic — ~$10/mo:** ~200 "fast" images. Enough for 91 icons **if** you're disciplined
  (1 roll each + ~100 retries). No unlimited Relax mode.
- **Standard — ~$30/mo:** ~15 fast hours **+ unlimited Relax** (slower but free/unbounded).
  Pick this if you want to iterate freely. Generate everything in Relax, cancel after a month.

Recommendation: **Standard for one month** if you want comfort; **Basic** if you'll be tight
and efficient. Either way it's a one-month cost — cancel when the library's done.

Interface: the **Midjourney web app** (midjourney.com) is easier than the Discord bot for
this — it has a visual "Style Reference" slot and a gallery. Either works; commands below are
the universal `/imagine` form.

---

## Step 1 — Lock the STYLE ANCHOR (the single most important step)

Consistency across 91 icons comes from one reusable style reference. Make it once.

1. Generate a clean first icon in the exact look you want. Suggested anchor prompt:

   ```
   flat cartoon avatar icon of a clapperboard, bold clean outlines, simple flat shapes,
   soft cell shading, centered, plain off-white background, sticker style, no text
   --ar 1:1 --style raw --v 7
   ```

2. From the 4 results, pick the best, **Upscale (U)** it.
3. Make it your style reference:
   - **Web app:** add the upscaled image to the **Style Reference** slot.
   - **Discord:** copy the image URL (or re-drag it in) and use `--sref <image-url>`.
4. Note the `--sref` value (URL or the `--sref <number>` code the web app gives you). You'll
   paste the **same** `--sref` + `--sw` on every icon from here on.

> **Tip — match the *style*, not the *palette*.** A `--sref` transfers the reference's COLORS
> along with its art style, and at `--sw 100` that color bleed is heavy (every icon drifts toward
> the anchor's palette). To keep the linework/shading consistent but let each icon keep its own
> real colors: **(a)** name the subject's colors in the prompt (see Step 2), **(b)** lower
> `--sw` to ~**40–70**, and **(c)** ideally pass 2–4 style references with *different* palettes
> (`--sref url1 url2 url3`) so MJ blends them and learns the style without locking one palette.

---

## Step 2 — The per-icon prompt recipe

Reusable template — only `<subject>` changes. **Always include the subject's real
colors** in `<subject>` (e.g. "Darth Vader, glossy black helmet and cape"; "Yoda,
green skin, brown robe"; "Iron Man helmet, red and gold") — explicit color words
override the palette bleed from the `--sref`:

```
flat cartoon avatar icon of <subject, with its real colors>, bold clean outlines,
simple flat shapes, soft cell shading, centered, plain off-white background,
sticker style, no text
--ar 1:1 --style raw --v 7 --sref <ANCHOR(S)> --sw 50
```

flat cartoon avatar icon of <subject, with its real colors>, bold clean thick outlines, simple flat shapes, soft cell shading, centered, plain white background, sticker style, no text, frame, border --ar 1:1 --raw --sw 50 --v 7



Parameter notes:
- `--ar 1:1` square (avatars are round-cropped later).
- `--style raw` less "MJ flair," more literal/icon-like.
- `--sref <ANCHOR(S)> --sw 50` the style lock — keep `--sref` and `--sw` identical on
  every icon. `--sw ~50` (vs 100) keeps the art style while letting each icon use its
  own colors; pass multiple refs (`--sref url1 url2 url3`) of varied palettes to dilute
  color bleed further. See the palette-vs-style tip in Step 1.
- Add `--no text, letters, words, frame, border` if stray text/frames appear.
- `--v 7` use the current model (newer is fine; keep the SAME version across all icons).

Workflow per icon: paste prompt → 4 results → pick best → **Upscale (U)** → download. Save
each as `raw/<pack-slug>/<icon-slug>.png` (see naming in Step 5).

---

## Step 3 — Generate each pack

Same template for every line below; paste the **subject** into `<subject>`. Keep the same
`--sref`/`--sw`/`--v` throughout so the whole library matches.

**Trademarked-character note:** packs 3, 8, 9, 10, 11, 19, Ripley (12), and named figures in
4/5/15 are famous characters. MJ v6+ renders these from their names (e.g. *"flat cartoon
avatar icon of Darth Vader"*). If one refuses or looks off-model, describe it by features
instead (e.g. *"a tall black armored helmet with an angular breathing mask, flat cartoon
icon"*). Object packs never have this problem.

| Pack (slug) | Subjects |
|---|---|
| 1. Movie Objects (`movie-objects`) | clapperboard · film reel · popcorn box · VHS tape · director's chair · Oscar statuette · movie ticket · film projector · 35mm camera · director's megaphone |
| 2. Movie Archetypes (`archetypes`) | film-noir detective · cowboy · astronaut · femme fatale · monster · superhero · villain · samurai · spy · explorer |
| 3. Star Wars (`star-wars`) | Darth Vader · Yoda · R2-D2 · C-3PO · Stormtrooper · Luke Skywalker · Princess Leia · Han Solo · Chewbacca · Boba Fett · Darth Maul (red & black face, double-bladed saber) · General Grievous · Clone Trooper (Phase II white armor) · Padmé Amidala · Battle Droid (tan) |
| 4. Indiana Jones (`indiana-jones`) | Indiana Jones with hat · the Ark of the Covenant · the golden idol · the brown fedora hat |
| 5. The Godfather (`godfather`) | Don Corleone · a horse · a single red rose |
| 6. James Bond (`james-bond`) | secret-agent silhouette holding a pistol · silver Aston Martin · martini glass with olive |
| 7. Jurassic Park (`jurassic-park`) | T-Rex · velociraptor · mosquito in amber fossil · safari jeep |
| 8. Lord of the Rings (`lotr`) | Gandalf the Grey · Gandalf the White · Frodo · the One Ring · Gollum · the Eye of Sauron |
| 9. Harry Potter (`harry-potter`) | Harry Potter · Dumbledore · the Sorting Hat · the Golden Snitch · Hedwig the owl |
| 10. Marvel (`marvel`) | Iron Man helmet · Captain America shield · Spider-Man mask · Thanos gauntlet · Thor's hammer (Mjölnir) · the Incredible Hulk (green) |
| 11. DC (`dc`) | Batman cowl · Superman logo · Wonder Woman tiara |
| 12. Alien (`alien`) | xenomorph · facehugger · Ripley |
| 13. Terminator (`terminator`) | T-800 endoskeleton skull · thumbs up from a hand |
| 14. Back to the Future (`back-to-the-future`) | the DeLorean · the flux capacitor · Marty's red puffer vest |
| 15. Kubrick (`kubrick`) | HAL 9000 red eye · the black monolith · the Overlook hotel carpet pattern · a bowler hat · a bone (from 2001) |
| 16. Tarantino (`tarantino`) | a glowing briefcase · a "Royale with Cheese" burger wrapper · a yellow tracksuit · a severed ear |
| 17. Standalone Classics (`classics`) | "Rosebud" sled · upright piano (Casablanca) · shower head (Psycho) · shark fin (Jaws) · kid on a bike silhouette (E.T.) · a red coat (Schindler's List) · a bar of soap (Fight Club) · a cardboard box (Se7en) · a moth (Silence of the Lambs) · a sharp suit (Goodfellas) · a captive-bolt cattle gun and a coin (No Country) |
| 18. Movie Club Picks (`club-picks`) | one per film — see below; **generate per film, ongoing** |
| 19. Avatar / Pandora (`pandora`) | Neytiri (blue Na'vi, yellow eyes) · Jake Sully's Na'vi avatar (blue) · mountain banshee / ikran (flying creature) |

**Pack 18 — Movie Club Picks (grows monthly).** Generate one as each film gets watched, using
the same recipe. Current entries (subject in parens):
The Master (glass of water) · Rebel Ridge (bicycle) · Princess Mononoke (kodama forest spirit)
· Primer (wristwatch) · Kingdom of Heaven (crusader cross) · Where the Wild Things Are (wolf
costume) · Smashing Machine (championship belt) · City of God (favela skyline) · Contact (radio
telescope dish) · Frailty (axe) · Oldboy (hammer) · Spirited Away (No-Face mask) · Three
Billboards (a billboard) · Birdman (Broadway marquee) · Heat (two coffee cups) · Eternal
Sunshine (a swirling fading-memory spiral) · Arlington Road (a mailbox). *(May 2026 picks TBD.)*

---

## Step 4 — Export at good resolution

Always **Upscale** the chosen result before downloading (gives ~1024²+). The icon displays at
32–96px in-app, so 1024² raw → 256² final is plenty of headroom. Download the upscaled PNG.

---

## Step 5 — Process into app-ready icons

Drop every downloaded PNG into `raw/<pack-slug>/<icon-slug>.png` (slugs: lowercase, hyphenated,
e.g. `raw/star-wars/darth-vader.png`). Then run this once — it makes the **outer** background
transparent (so the icon matches the app theme + user-color ring), trims to the artwork, squares
it, and exports a 256px WebP into the right place:

```python
# scripts/avatar_process.py
# pip install pillow numpy scipy
import pathlib
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_erosion

SIZE = 256
TOL = 22  # how close to the corner colour still counts as background

SRC = pathlib.Path("raw")
OUT = pathlib.Path("public/avatars")

def cut_background(img):
    """Make only the OUTER background transparent, preserving white *inside* the
    icon (Stormtrooper armour, C-3PO highlights, piano keys, Jaws' teeth…). We
    sample the corner colour and remove just the pixels of that colour that are
    connected to the image border — interior matches are left alone."""
    img = img.convert("RGBA")
    arr = np.array(img)
    bg_col = arr[0, 0, :3].astype(int)                       # whatever the bg actually is
    near_bg = (np.abs(arr[:, :, :3].astype(int) - bg_col).max(axis=2) <= TOL)
    lbl, _ = label(near_bg)
    border = set(lbl[0]) | set(lbl[-1]) | set(lbl[:, 0]) | set(lbl[:, -1])
    border.discard(0)
    bg = np.isin(lbl, list(border))                          # bg = border-connected only
    bg = ~binary_erosion(~bg, iterations=1)                  # nibble the 1px anti-alias halo
    arr[bg, 3] = 0
    return Image.fromarray(arr, "RGBA")

def square_pad(img):
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)                                 # trim to the artwork
    w, h = img.size
    s = max(w, h)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(img, ((s - w) // 2, (s - h) // 2), img)     # pad to square, centered
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)

for src in SRC.rglob("*.png"):
    dst = (OUT / src.relative_to(SRC)).with_suffix(".webp")
    dst.parent.mkdir(parents=True, exist_ok=True)
    square_pad(cut_background(Image.open(src))).save(dst, "WEBP", quality=90, method=6)
    print("✓", dst)
```

Result: transparent-background, square, 256px WebP icons under `public/avatars/<pack>/<icon>.webp` —
the member's user-color ring + the theme surface show through cleanly behind the art.

**Tuning:** if a faint outline of the old background remains, bump `TOL` (e.g. 30). If it eats into
the icon, lower it. For any icon whose background isn't a clean flat colour (a gradient or busy
backdrop slipped in), fall back to AI cutout for just that file: `pip install rembg onnxruntime`
then `from rembg import remove; img = remove(img.convert("RGBA"))` in place of `cut_background`.

> Note: keep generating on a **plain, flat background** (the prompt says "plain off-white
> background") — that's what makes this one-pass keying clean. Avoid prompts that add scenery or
> gradients behind the icon.

---

## Step 6 — Folder structure & manifest

```
public/avatars/
  movie-objects/clapperboard.webp
  movie-objects/film-reel.webp
  star-wars/darth-vader.webp
  ...
```

Then a manifest the app reads (Claude will create/maintain this when wiring the UI):

```js
// src/lib/avatars.js
export const AVATAR_PACKS = [
  { slug: 'movie-objects', name: 'Movie Objects', icons: [
    { id: 'movie-objects/clapperboard', label: 'Clapperboard' },
    { id: 'movie-objects/film-reel',    label: 'Film Reel' },
    // ...
  ]},
  // ...one entry per pack
]
export const avatarSrc = (id) => `/avatars/${id}.webp`
```

`users.avatar_id` stores the `id` string (e.g. `"star-wars/darth-vader"`); the app falls back
to colored initials when it's null. **Keep the slugs in this guide as the canonical ids** so the
manifest, the files, and the DB all agree.

---

## Step 7 — Hand back to Claude

Once `public/avatars/**` is populated, Claude builds the wiring (the deferred part):
- a shared `<Avatar user={u} size={n}/>` component (image if `avatar_id` set, else initials),
- swap the ~10 scattered initials renderers over to it,
- the **Profile → avatar picker** (browse packs, select → save `avatar_id`),
- the **Admin → Assets tab** (manage/add packs).

You don't need every pack done first — even one pack is enough to build and test the picker.

---

## Consistency checklist (so all 91 match)

- ✅ Same `--sref <anchor(s)> --sw 50` on **every** prompt (keep `--sw` constant across the set).
- ✅ Same `--v` (model version) and `--style raw` throughout — don't switch mid-library.
- ✅ Same style words ("bold clean outlines, simple flat shapes, soft cell shading, sticker
  style, plain off-white background") on every prompt.
- ✅ **Name each subject's real colors** in the prompt so icons keep their own palette instead
  of drifting toward the reference's colors (the `--sref` bleeds palette; the words fight back).
- ✅ One subject per icon, centered, nothing else in frame.
- ✅ If a character comes out off-model, re-roll or describe by features. If the *colors* are
  wrong (matching the reference instead of the subject), name the colors and/or lower `--sw`.

---

## Appendix — Grid method (only if you're on Basic and want fewer generations)

MJ always returns a 2×2 of four *variations*; to get a content-grid, ask for a "sticker sheet."
Prompt e.g.: `sticker sheet of 9 flat cartoon movie-object icons in a clean 3x3 grid, evenly
spaced, plain white background, no text --ar 1:1 --sref <anchor> --sw 50`. Pick the cleanest of
the 4, **Upscale**, then slice:

```python
# scripts/slice_grid.py  — python slice_grid.py sheet.png 3 3
import sys, pathlib
from PIL import Image
sheet = Image.open(sys.argv[1]).convert("RGBA")
rows, cols = int(sys.argv[2]), int(sys.argv[3])
W, H = sheet.size; cw, ch = W // cols, H // rows
out = pathlib.Path("raw/_cells"); out.mkdir(parents=True, exist_ok=True)
n = 0
for r in range(rows):
    for c in range(cols):
        sheet.crop((c*cw, r*ch, (c+1)*cw, (r+1)*ch)).save(out / f"cell_{n:02d}.png"); n += 1
```

Then move/rename the cells into `raw/<pack>/<icon>.png` and run `avatar_process.py` as normal
(its rembg + bbox trim cleans up each cell). Downsides: MJ grids miscount/merge cells and need
hand-checking — which is why per-icon is the recommended path.
