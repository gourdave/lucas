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

## NEXT UP
- (nothing queued — awaiting the next batch from Lucas/David)

## The idea ledger (from the Stardew/Minecraft/Roblox brainstorm, 2026-06-12)
Nothing here gets forgotten. Built items move to "Shipped".

### Locations (the long arc — one per release)
- ✅ The Pond (~60m, moved from 145m on David's request — fish in peace) *(v8)*
- ✅ The Corn Maze (~250m) *(v11)*
- The Radio Tower (~400m) — climb for a one-time view + map/compass upgrade
- The Storm Cellar (~500m) — trapdoor mini-dungeon, best loot density,
  scariest place in the game
- The Other House (~700m, ENDGAME) — an exact copy of your house with the
  lights on, slightly wrong inside, legendary chest upstairs

### Entities with learnable rules (Doors-style)
- ✅ The Listener — moves only when you move *(v8)*
- ✅ The Borrower *(v11)*
- The Scarecrow That Wasn't There — closer every time you look away;
  stare it down to win

### Quests & story
- ✅ Number stations (radio coordinates → buried cache) *(v8)*
- Dr. Umbra multi-step requests ("I lost something out there…") — can use
  real Claude for flavor text
- Survive-N-nights ledger with milestone rewards (5/10/25), trophy display

### Home & systems
- Restoration Board (Stardew community center): donate item sets to unboard
  rooms — attic telescope, guest room, etc.
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
