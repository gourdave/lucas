# Roadmap & parked thoughts

## Shipped
- v1 MVP · v2 realism+kitchen · v3 combat+shop · v4 Claude therapist (global)
- v5 progression: expeditions/Bravery, levels, quests, garden, pets
- v6 everything-else: journal, photo mode, decor, tapes/radio, The Harvester,
  Harvest Night, bike/cart, stardust/nightmares, online leaderboard
- v7 interactive dreams (Phase H): every dream is a playable minigame
- v8 the fields awaken (Phase I): THE POND + one-touch reel fishing with an
  8-species fish dex (streak system — keep casting and stranger things bite,
  Mirror Koi on Harvest Night) · NUMBER STATIONS — once a day the radio reads
  buried-cache coordinates, dig it up, survive the walk home (25% of caches
  are alarmed) · THE LISTENER — first rule-based entity: it only moves when
  you move; freeze 4s to shake it (can't be outrun, light passes through it)
- v8.1 WcDONALD'S (Phase J, designed by Lucas): a liminal fast-food joint at
  the 50m mark — faceless white mannequin employees in uniform running a
  scripted response system (NO ai, per spec), a 4-item menu paid in coins,
  and The Regulars: monsters at the tables who just eat their food and mind
  their own business. Parody name on purpose (trademark safety).

- v9 the string wall (Phase K, Outer-Wilds-inspired): a corkboard of
  mysteries that pin themselves as you notice clues, with hints that grow
  more generous each unsolved day (frustration has a shelf life). Four
  launch threads: the WANDERING GNOME (relocates only while unobserved —
  photograph it in 5 spots), the UPSTAIRS WINDOW figure (exists only in
  photographs), the scarecrow's SWEET TOOTH (a book's margin notes are
  true), and TRIBUTE TO STATUES (stand perfectly still 60s in the fields).
  Secrets are never required — bonus loot, badges, and lore only. Plus a
  carved signature behind the barn for thorough explorers.

- v10 graphics & texture pass: anisotropic filtering on every texture,
  512px soil with plough scratches + grit, root-shadow gradients on
  wheat/grass, a drifting overcast CLOUD DECK that dissolves into the
  deep-field dark, prowling ground-fog wisps past the 100m mark,
  fake-AO contact shadows under house/barn/WcDonald's, glow halos on
  the sign + Harvester lantern + porch lights, fear-driven exposure,
  and an AUTO-QUALITY guard (sustained <20fps sheds the mood layers
  and drops pixel ratio — game identical). Researched against current
  three.js mobile guidance: stayed Lambert, no post-processing chain.

- v11 the deep-field update (Phase L): THE CORN MAZE at ~250m (fixed
  seeded layout, real collision, daily chest at the heart, grin watchers
  that sink away, signpost near home) · THE BORROWER — a knee-high thief
  that smells 8+ pending coins past 100m, snatches 40%, and BOLTS; light
  makes it drop everything, and if it escapes it stashes the coins under
  a beacon (nothing is ever lost) · CAMP KITS at the stall (120c, max 3):
  place a campfire safe-circle in the deep fields — nothing hunts you in
  the firelight, calm regenerates, and the fire banks loot at 70% (carry
  it home for full Bravery instead — your call, that's the game)

- v12 the fishing update (Phase M, designed by Lucas): a RIVER that winds
  from the yard fence down to the pond · THE BAIT SHACK on the bank (run
  by the scarecrow's cousin: driftwood, waders, bucket head) selling rod
  upgrades (Willow 150c, Storm-Line 400c — wider cage, faster reel,
  slower escapes) and bait (Worm Tin +1 streak, Glow Grubs +2 and
  boot-proof, 3 casts each, faster bites) · FISH COOKING — banked fish
  arrive as raw fish in your pocket; the stove turns them into fish
  dinner (50 food, 25 calm)

- v12.1 THE MINIMAP (Luke's request): a little north-up compass-glass,
  bottom-right — you in the middle, landmarks color-coded (home, pond,
  WcDonald's, barn, maze, your camps), and anything time-sensitive
  pulsing (dig sites, lost bags, Borrower stashes). Dims with dread,
  hides in dreams. Canvas 2D at ~7fps — zero GPU cost.

- v13 the tower update (Phase N): THE RADIO TOWER at ~400m — the red
  light you could always see is climbable; one look from the top widens
  the minimap's range forever (170m → 280m) · THE SCARECROW THAT WASN'T
  THERE — the Listener's opposite: it moves ONLY when you look away
  (8.5 m/s, terrifying); stare it down for 3s and it sinks, embarrassed
  (+15 pending, badge at ×3) · THE DAY LEDGER — every distinct day
  played counts, milestones at 5/10/25 days pay coins + badges
  (Settler / Resident / Old-Timer)

- v13.1 THE DOOR (teaser): at exactly 1000m down the power lines, a
  single locked door stands in the wheat. Door Knocker badge.
- v14 LEVEL 3999 — "THE TRUE ENDING" (Phase O, designed by Lucas):
  behind the 1000m door, a neon-lit RETRO ARCADE — a total safe haven
  (no entities, +3 calm/s, chiptune, haze stands down). THREE playable
  cabinets (Wheat Invaders / Almond Catch / Flappy Grin), a slushie
  machine, a hidden golden token, a faceless attendant to high-five,
  and a RANDOMIZED 4-item ESCAPE TASK board. Finish the list → the EXIT
  opens → walk through for the TRUE ENDING (credits roll: "created by
  KAMSAMNOR") → wake in your bed +500c +100 stardust, everything
  banked. The task list re-rolls; the world goes on FOREVER, exactly as
  Lucas said. (endings counter tracks how many times you've cleared it.)

- v15/v16 ONLINE MODE (Phase P, approved by David 2026-06-13: "just his
  close friends anyway, I'm not marketing it"): friends-scale LIVE presence
  through the existing Durable Object — share a room code, up to 8 friends
  land in the same world as glowing ghost avatars with name tags + minimap
  dots. FRIEND CHAT (the old "no chat ever" rule was lifted for friends-only
  rooms): auto-generated names only (COPPA-clean), control-chars stripped,
  never stored, and a profanity filter both client-side (js/profanity.js)
  and server-side (v16, the Durable Object enforces it so a hacked client
  can't bypass it). Anonymous usage stats heartbeat to the worker.

- v17 THE STORM CELLAR (Phase Q, ~500m): a steel bulkhead in the wheat
  (signpost near home points the way) opens onto concrete steps down into
  the dark UNDER the fields — the richest loot on the level. Searchable
  supply crates (once a day each) + a daily DEEP CHEST (180–270 pending
  coins + a guaranteed Midnight Egg + stardust). Lit by a few flickering
  bulbs. THE DWELLER lives in the dark: a learnable-rule entity that
  advances through shadow but CANNOT enter the light — stay in the bulbs,
  and a flare shot blasts it back to its lair. No death: if it catches you
  (or your calm bottoms out) the cellar ejects you to the surface and your
  loot drops as a recoverable bag right by the doors. Badges: Deep Cellar
  (open the chest), Light Keeper (climb out after the Dweller woke).

- v18 THE RESTORATION BOARD (Phase R, a Stardew community-center): a board
  on the north wall lists PROJECTS, each asking for a set of things you
  gather and cook (only replenishable stuff — no tapes/pets/dex items, so
  nothing irreplaceable is ever spent). Fill The Pantry / Smokehouse /
  Garden Shed / Attic and a lantern lights along the path home (the walk
  back gets warmer as you restore the house) + the attic telescope rises;
  finish all four to unlock the CAPSTONE, which floods every window with
  warm light. Donations bank coins/stardust/XP. Badges: Handy (first
  project), The House Restored (capstone).

## NEXT UP — the location arc continues:
1. **THE OTHER HOUSE (~700m, ENDGAME)** — an exact copy of your house with
   the lights on, slightly wrong inside, legendary chest upstairs. (Online
   mode shipped v15/16; Storm Cellar shipped v17. David parked ghost-mode /
   live-coop refinements for later.)

## Multiplayer feasibility note (researched constraints, 2026-06-13)
- Full live co-op = WebSocket relay via the existing Durable Object —
  technically possible but heavy: netcode, interpolation, abuse surface,
  and COPPA exposure (real-time interaction between minors).
- RECOMMENDED FIRST STEP — "GHOST MODE": async multiplayer through the
  existing leaderboard worker. Players' journeys leave anonymous traces
  (ghostly footprint trails, abandoned camp echoes, "someone dug here"
  marks) fetched read-only, attributed only to auto-generated names.
  No chat, no live presence, no personal data → COPPA-clean, zero new
  infrastructure, feels ALIVE. Doors-style "other players were here."
- NO chat in any version. Hard rule unless lawyers say otherwise.

## The idea ledger (from the Stardew/Minecraft/Roblox brainstorm, 2026-06-12)
Nothing here gets forgotten. Built items move to "Shipped".

### Locations (the long arc — one per release)
- ✅ The Pond (~60m, moved from 145m on David's request — fish in peace) *(v8)*
- ✅ The Corn Maze (~250m) *(v11)*
- ✅ The Radio Tower *(v13)*
- ✅ The Storm Cellar (~500m) — trapdoor mini-dungeon, best loot density,
  scariest place in the game *(v17)*
- The Other House (~700m, ENDGAME) — an exact copy of your house with the
  lights on, slightly wrong inside, legendary chest upstairs

### Entities with learnable rules (Doors-style)
- ✅ The Listener — moves only when you move *(v8)*
- ✅ The Borrower *(v11)*
- ✅ The Scarecrow That Wasn't There *(v13)*

### Quests & story
- ✅ Number stations (radio coordinates → buried cache) *(v8)*
- Dr. Umbra multi-step requests ("I lost something out there…") — can use
  real Claude for flavor text
- ✅ Day ledger with 5/10/25 milestones *(v13)*

### Home & systems
- ✅ Restoration Board (Stardew community center): donate item sets to
  restore the house — path lanterns, attic telescope, the whole house
  glowing warm *(v18)*
- ✅ Camp kits *(v11)*
- Crop mutations: rare golden/glittering crops worth 10×, journal entries
- Pet levels: XP while following you, abilities strengthen, one evolution
- Weather days: fog morning / rain (almond water falls?) variations

## Endgame & difficulty design (decided 2026-06-12)
- The endgame is the location arc, gated by DISTANCE (the natural
  difficulty curve: fear, entity density, Listener spawns all scale with
  depth) — not by stats. Target: a kid playing casually reaches The Other
  House in ~2 weeks; a focused push can do it in a long weekend.
- "Decently difficult, not too difficult" knobs, in order of preference:
  1. distance (longer supply line, more time exposed)
  2. entity pressure (spawn rates deep out)
  3. navigation (maze sightlines, cellar darkness)
  NEVER: damage sponges, fail-states that delete progress, or anything
  that breaks the no-death rule. Blackouts + lost bags stay the only
  penalty, and lost bags are always recoverable.
- Replayability AFTER the endgame (the "keep collecting" loop):
  - the journal IS the completion meter: fish dex, creature dex, tapes,
    badges, books, pets, crops, dreams — 100% awards a final title
    ("Curator of Level 10") and a visible house upgrade (golden porch light)
  - daily systems keep ticking forever: quests, chest, number stations,
    Harvest Nights, boss respawn, leaderboards
  - streak/rare layers (fish streaks, Mirror Koi, midnight eggs) stay rare
    enough to chase after story completion
- Save state: already persistent — localStorage, autosaved every 10s and
  on tab-hide, survives app/PWA restarts on the same device. Future nice-
  to-have (parked): an export/import "save code" so Lucas can move his
  save between devices without accounts (COPPA-clean).

## Parked — bigger explorations (David, 2026-06-12)
- **Photorealism push** — superseded by the queued "graphics & texture
  improvement pass" above for now; a true photoreal look needs asset
  pipelines and is still parked
- **Multiplayer capabilities** — what's feasible (shared world? co-op
  expeditions? ghosts of other players?) given static hosting + the worker
- **More customization, cosmetics & gamification** — skins, outfits, gun
  skins, seasonal events, battle-pass-style free tracks
- **Legal analysis before any monetization** — the game is based on the
  "Backrooms" creepypasta/community lore (fandom-derived setting, original
  code and art). Need to research: trademark/copyright status of "Backrooms"
  and "Level 10" concepts, implications of fan-work monetization,
  COPPA/child-privacy rules for a kid-facing game with online features,
  app-store kid rules.
  **Decision: monetization is a THOUGHT ONLY until viability is confirmed.**
- **If viable:** in-game currency + purchases for cosmetics/convenience only —
  **hard rule: no core gameplay behind paywalls, ever.**
