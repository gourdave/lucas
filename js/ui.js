// ui.js — all the DOM: HUD, title screen, fades, toasts, the book reader and
// the therapist chat panel. Other modules never touch the DOM directly.

import { State, save } from './state.js';
import { SHOP_ITEMS, purchase } from './shop.js';
import { getClaudeKey, setClaudeKey } from './therapist.js';
import { claimQuest, xpNeed } from './progression.js';
import { journalSections } from './journal.js';
import { BOARDS, fetchBoard, ensureLbName, rerollLbName } from './lb.js';
import { CROPS } from './garden.js';
import { PETS, RARITY } from './pets.js';
import { ReelGame, FISH, RARITY_COLOR } from './fishing.js';

const $ = (id) => document.getElementById(id);

// the lore library on the living-room shelf
export const BOOKS = [
  {
    id: 'fieldguide',
    title: 'Field Guide — Level 10, “The Bumper Crop”',
    body: `Survival class: peaceful. Mostly.

An expanse of wheat and barley with no known end, divided into plots by tree lines and wire fences. The sky is permanently overcast and the day is continuous — near shelter, anyway.

The crop is safe to eat. The puddles that taste of almonds are safe to drink. The buildings are usually empty.

Note from a previous resident: "Usually."`,
  },
  {
    id: 'almond',
    title: 'On Almond Water',
    body: `Sweet, cold, found in bottles and puddles where no one left it.

One bottle settles the mind faster than a night's sleep. Carry one whenever you walk past the far fences.

Where does it come from? The kindest theory: something enormous and gentle wanders the far plots, weeping it on purpose, so the lost have something to drink.

No one has ever been hurt by the thing in that theory. Keep the theory.`,
  },
  {
    id: 'night',
    title: 'On the Things You See at Night',
    body: `The night here doesn't fall. It follows. Walk far enough from the house and it catches up with you, and it does not arrive empty-handed.

The tall ones are hallucinations. Probably. Either way the rules are the same:

1. Don't stare. They hate being seen and they show it.
2. Don't stand still too long.
3. Walk home. They cannot exist anywhere near the house. The day un-happens them.`,
  },
  {
    id: 'soil',
    title: 'The Soil (do not dig)',
    body: `The topsoil is exactly one meter deep everywhere. We measured. We wish we hadn't.

Below the meter mark the ground gives way to worms — a slow, patient dark of them, going down further than the shovel cared to learn.

They have never come up. They have never needed to.

The wheat grows anyway. The wheat is braver than we are.`,
  },
  {
    id: 'house',
    title: 'About This House',
    body: `Nobody built it. It was already here, fenced and furnished, three beds made, water running, one lamp on.

The house likes being lived in. Doors never stick for a resident. The kitchen never quite runs out. Cold rooms warm up just before you enter them.

Be kind to it. Say goodnight sometimes. We're fairly sure it can hear you, and we're certain it tries.`,
  },
  {
    id: 'journal',
    title: 'Dream Journal of a Previous Resident',
    body: `Night 4 — dreamt the plots came loose from the ground and floated. Woke holding a bottle I didn't bring to bed.

Night 9 — dreamt the fields again but in colors that have no daytime names. A giant smile in the sky watched me the whole time. It meant well. I could tell.

Night 12 — dreamt I was ant-small at the foot of a single wheat stalk tall as weather. A red beetle was climbing. I think the beetle knew the way somewhere.

Sleep is the best part of this level. Dream lots.`,
  },
  {
    id: 'fork',
    title: 'For K.',
    body: `Found this note folded inside the cookbook:

"To whoever lives here after me —

The therapist in the living room is alright. He looks like the things outside. He is not like the things outside. He's been here longer than the fence and he has never once lied to me.

The whole level is signed, you know. Look at the title of the sky some time.

— for Kamsamnor, who made the fields."`,
  },
];

// the meals you can make yourself and carry into the fields
export const MEALS = {
  nuggets: { name: 'chicken nuggets', emoji: '🍗', hunger: 25, calm: 5 },
  shrimp: { name: 'shrimp', emoji: '🍤', hunger: 35, calm: 10 },
  pasta: { name: 'pasta', emoji: '🍝', hunger: 35, calm: 10 },
  bread: { name: 'fresh bread', emoji: '🍞', hunger: 45, calm: 15 },
  juice: { name: 'apple juice', emoji: '🧃', hunger: 5, calm: 15, drink: true },
  calmbar: { name: 'calm bar', emoji: '🍫', hunger: 10, calm: 40 },
  stew: { name: 'golden stew', emoji: '🥘', hunger: 60, calm: 20 },
  cookies: { name: 'wheat cookies', emoji: '🍪', hunger: 20, calm: 25 },
};

export const UI = {
  onDrink: null,
  onEat: null,
  onPrompt: null,
  onBookClosed: null,
  onChatClosed: null,

  init() {
    this.hud = $('hud');
    this.calmfill = $('calmfill');
    this.homeinfo = $('homeinfo');
    this.homearrow = $('homearrow');
    this.homedist = $('homedist');
    this.waterbtn = $('waterbtn');
    this.watercount = $('watercount');
    this.prompt = $('prompt');
    this.vignette = $('vignette');
    this.flashEl = $('flash');
    this.fadeEl = $('fade');
    this.toastEl = $('toast');
    this.dreamtitle = $('dreamtitle');
    this.title = $('title');
    this.book = $('book');
    this.chat = $('chat');
    this.chatlog = $('chatlog');
    this.chatinput = $('chatinput');

    this.waterbtn.addEventListener('click', () => this.onDrink && this.onDrink());
    this.prompt.addEventListener('click', () => this.onPrompt && this.onPrompt());
    $('bookclose').addEventListener('click', () => {
      this.book.classList.add('hidden');
      this.onBookClosed && this.onBookClosed();
    });
    $('chatclose').addEventListener('click', () => this.closeChat());
    $('shopclose').addEventListener('click', () => this.closeShop());
    $('questsclose').addEventListener('click', () => this.closeQuests());
    $('petsclose').addEventListener('click', () => this.closePets());
    $('pickerclose').addEventListener('click', () => this.closePicker());
    $('hatchok').addEventListener('click', () => {
      $('hatch').classList.add('hidden');
      const r = this._hatchResolve;
      this._hatchResolve = null;
      r && r();
    });
    $('questsbtn').addEventListener('click', () => this.onOpenQuests && this.onOpenQuests());
    $('petsbtn').addEventListener('click', () => this.onOpenPets && this.onOpenPets());
    $('journalbtn').addEventListener('click', () => this.onOpenJournal && this.onOpenJournal());
    $('lbbtn').addEventListener('click', () => this.onOpenLb && this.onOpenLb());
    $('photobtn').addEventListener('click', () => this.onPhoto && this.onPhoto());
    $('journalclose').addEventListener('click', () => { $('journalpanel').classList.add('hidden'); this.onPanelClosed && this.onPanelClosed(); });
    $('lbclose').addEventListener('click', () => { $('lbpanel').classList.add('hidden'); this.onPanelClosed && this.onPanelClosed(); });
    $('chatsend').addEventListener('click', () => this._send());
    this.chatinput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._send();
    });
    // subtle animated film grain, generated at boot
    const gcv = document.createElement('canvas');
    gcv.width = gcv.height = 128;
    const gctx = gcv.getContext('2d');
    const img = gctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    document.getElementById('grain').style.background = `url(${gcv.toDataURL()})`;

    // the hidden "ai setup" screen (for grown-ups) on the title screen
    const aisetup = $('aisetup');
    const aikey = $('aisetup-key');
    const aistatus = $('aisetup-status');
    $('aisetup-open').addEventListener('click', () => {
      aikey.value = getClaudeKey();
      aistatus.textContent = getClaudeKey() ? '✦ a key is saved — Claude plays Dr. Umbra' : 'no key saved — built-in brain in use';
      aisetup.classList.remove('hidden');
    });
    $('aisetup-save').addEventListener('click', () => {
      setClaudeKey(aikey.value.trim());
      aistatus.textContent = aikey.value.trim() ? '✦ saved! Claude now plays Dr. Umbra on this device' : 'no key saved — built-in brain in use';
    });
    $('aisetup-clear').addEventListener('click', () => {
      setClaudeKey('');
      aikey.value = '';
      aistatus.textContent = 'key removed — built-in brain in use';
    });
    $('aisetup-close').addEventListener('click', () => aisetup.classList.add('hidden'));

    // keep the chat panel above the soft keyboard on phones
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', () => {
        const lift = innerHeight - visualViewport.height - visualViewport.offsetTop;
        this.chat.style.bottom = Math.max(0, lift) + 'px';
      });
    }
  },

  // ---------- title ----------
  showTitle(canContinue) {
    this.title.classList.remove('hidden');
    $('btn-continue').classList.toggle('hidden', !canContinue);
  },
  hideTitle() {
    this.title.classList.add('hidden');
    this.hud.classList.remove('hidden');
  },

  // ---------- HUD ----------
  setCalm(v) {
    this.calmfill.style.width = Math.max(0, Math.min(100, v)) + '%';
    this.calmfill.className = v < 25 ? 'low' : v < 55 ? 'mid' : '';
  },
  setWater(n) {
    this.watercount.textContent = n;
    this.waterbtn.classList.toggle('hidden', n <= 0);
  },
  setHunger(v) {
    const fill = document.getElementById('hungerfill');
    fill.style.width = Math.max(0, Math.min(100, v)) + '%';
    fill.className = v < 25 ? 'low' : '';
  },
  setMoney(n) {
    document.getElementById('moneycount').textContent = n;
  },
  setLevel() {
    document.getElementById('levellabel').textContent = 'LV ' + State.level;
    document.getElementById('xpfill').style.width =
      Math.min(100, (State.xp / xpNeed(State.level)) * 100) + '%';
  },
  setBravery(mult) {
    const el = document.getElementById('bravery');
    el.classList.toggle('hidden', mult === null);
    if (mult !== null) document.getElementById('braveryval').textContent = mult.toFixed(1);
  },
  setPending(n) {
    const el = document.getElementById('pending');
    el.classList.toggle('hidden', n <= 0);
    if (n > 0) document.getElementById('pendingval').textContent = n;
  },
  setPetsButton(show) {
    document.getElementById('petsbtn').classList.toggle('hidden', !show);
  },
  // the scribbled note from the number station (null hides it)
  setDig(text) {
    const el = $('digchip');
    if (!text) { el.classList.add('hidden'); return; }
    if (el.textContent !== text) el.textContent = text;
    el.classList.remove('hidden');
  },

  // ---------- quests ----------
  openQuests() {
    $('quests').classList.remove('hidden');
    this._renderQuests();
  },
  closeQuests() {
    $('quests').classList.add('hidden');
    this.onPanelClosed && this.onPanelClosed();
  },
  _renderQuests() {
    const wrap = $('questlist');
    wrap.innerHTML = '';
    State.quests.list.forEach((q, i) => {
      const row = document.createElement('div');
      row.className = 'rowitem';
      const pct = Math.min(100, (q.progress / q.target) * 100);
      row.innerHTML = `
        <div class="ri-main">
          <div class="ri-title">${q.claimed ? '✅ ' : ''}${q.desc}</div>
          <div class="ri-sub">${q.progress}/${q.target} · reward: 🪙${q.coins} + ${q.xp}xp</div>
          <div class="qbar"><div style="width:${pct}%"></div></div>
        </div>`;
      const btn = document.createElement('button');
      btn.textContent = q.claimed ? 'claimed' : q.progress >= q.target ? 'CLAIM' : '…';
      btn.disabled = q.claimed || q.progress < q.target;
      btn.addEventListener('click', () => {
        if (claimQuest(i)) {
          this.onQuestClaimed && this.onQuestClaimed(q);
          this._renderQuests();
        }
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    });
    const note = document.createElement('div');
    note.className = 'ri-sub';
    note.style.textAlign = 'center';
    note.textContent = 'New quests every day — Dr. Umbra posts them at midnight.';
    wrap.appendChild(note);
  },

  // ---------- pets ----------
  openPets() {
    $('petspanel').classList.remove('hidden');
    this._renderPets();
  },
  closePets() {
    $('petspanel').classList.add('hidden');
    this.onPanelClosed && this.onPanelClosed();
  },
  _renderPets() {
    const wrap = $('petlist');
    wrap.innerHTML = '';
    if (!State.pets.owned.length && !State.pets.eggs.length) {
      wrap.innerHTML = '<div class="ri-sub" style="text-align:center">No pets yet — find mystery eggs deep in the fields (past the 75m mark) and hatch them in the incubator!</div>';
    }
    for (const pet of State.pets.owned) {
      const info = PETS[pet.type];
      const rar = RARITY[info.rarity];
      const row = document.createElement('div');
      row.className = 'rowitem';
      const active = State.pets.active === pet.uid;
      row.innerHTML = `
        <div style="font-size:26px">${info.emoji}</div>
        <div class="ri-main">
          <input class="pet-name-input" value="${pet.name.replace(/"/g, '')}" maxlength="18">
          <div class="ri-sub" style="color:${rar.color}">${rar.name} · ${info.ability}</div>
        </div>`;
      row.querySelector('input').addEventListener('change', (e) => {
        pet.name = e.target.value.slice(0, 18) || info.name;
        save();
      });
      const btn = document.createElement('button');
      btn.textContent = active ? 'following ✓' : 'follow me';
      if (active) btn.className = 'ghost3';
      btn.addEventListener('click', () => {
        State.pets.active = active ? null : pet.uid;
        save();
        this._renderPets();
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    }
    if (State.pets.eggs.length) {
      const head = document.createElement('div');
      head.className = 'ri-sub';
      head.textContent = `🥚 Eggs waiting: ${State.pets.eggs.length} — take them to the incubator in the house!`;
      wrap.appendChild(head);
    }
  },

  // ---------- the collection journal ----------
  openJournal() {
    const { sections, pct } = journalSections();
    $('journalpct').textContent = pct + '% complete';
    const body = $('journalbody');
    body.innerHTML = '';
    for (const sec of sections) {
      const head = document.createElement('div');
      head.className = 'j-section';
      head.textContent = sec.title;
      body.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'j-grid';
      for (const it of sec.items) {
        const el = document.createElement('div');
        el.className = 'j-item' + (it.got ? '' : ' missing');
        el.innerHTML = `<span>${it.emoji}</span><span>${it.name}${it.sub ? ' <span style="color:#8d8470">· ' + it.sub + '</span>' : ''}</span>`;
        grid.appendChild(el);
      }
      body.appendChild(grid);
    }
    $('journalpanel').classList.remove('hidden');
  },

  // ---------- the leaderboard ----------
  async openLb(initialBoard = 'depth') {
    const tabs = $('lbtabs');
    tabs.innerHTML = '';
    for (const [id, b] of Object.entries(BOARDS)) {
      const btn = document.createElement('button');
      btn.textContent = `${b.emoji} ${b.name}`;
      if (id === initialBoard) btn.className = 'active';
      btn.addEventListener('click', () => this.openLb(id));
      tabs.appendChild(btn);
    }
    const body = $('lbbody');
    body.innerHTML = '<div class="ri-sub" style="text-align:center">loading…</div>';
    $('lbpanel').classList.remove('hidden');
    const top = await fetchBoard(initialBoard);
    const myName = ensureLbName();
    body.innerHTML = '';
    const me = document.createElement('div');
    me.className = 'rowitem';
    me.innerHTML = `<div class="ri-main"><div class="ri-title">You are <b>${myName}</b></div>
      <div class="ri-sub">auto-generated name — no real names on the board</div></div>`;
    const reroll = document.createElement('button');
    reroll.textContent = '🎲 new name';
    reroll.addEventListener('click', () => { rerollLbName(); this.openLb(initialBoard); });
    me.appendChild(reroll);
    body.appendChild(me);
    if (!top) {
      body.insertAdjacentHTML('beforeend', '<div class="ri-sub" style="text-align:center">The board is asleep right now — try again later!</div>');
      return;
    }
    if (!top.length) {
      body.insertAdjacentHTML('beforeend', '<div class="ri-sub" style="text-align:center">Nobody yet. Be the first!</div>');
    }
    top.forEach((row, i) => {
      const el = document.createElement('div');
      el.className = 'lb-row' + (row.name === myName ? ' me' : '');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      el.innerHTML = `<span class="lb-rank">${medal}</span><span class="lb-name">${row.name}</span><span>${row.score}${BOARDS[initialBoard].unit}</span>`;
      body.appendChild(el);
    });
  },

  // ---------- fishing: the one-touch reel minigame ----------
  // phases: cast (wait for the bite) → reel (the ReelGame) → reveal → done.
  // onEvent('bite'|'caught'|'escaped') lets main.js play sounds; onDone gets
  // 'caught' | 'escaped' | 'cancel'.
  openFishing(fishId, onEvent, onDone) {
    const wrap = $('fishpanel');
    const msg = $('fishmsg');
    const track = $('fishtrack');
    const zone = $('fishzone');
    const icon = $('fishicon');
    const fill = $('fishprogfill');
    const hint = $('fishhint');
    wrap.classList.remove('hidden');
    track.classList.add('dim');
    icon.textContent = '🐟';
    msg.textContent = 'the line sinks into the dark water…';
    msg.style.color = '#9fb4be';
    hint.textContent = 'wait for it…';
    let holding = false;
    let game = null;
    let raf = 0;
    let lastT = 0;
    let finished = false;

    const down = (e) => { e.preventDefault(); holding = true; };
    const up = () => { holding = false; };
    wrap.addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);

    const cleanup = () => {
      finished = true;
      cancelAnimationFrame(raf);
      clearTimeout(this._biteTimer);
      wrap.removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      $('fishclose').onclick = null;
    };
    $('fishclose').onclick = () => {
      cleanup();
      wrap.classList.add('hidden');
      onDone('cancel');
    };

    // the wait. then the BITE.
    this._biteTimer = setTimeout(() => {
      if (finished) return;
      onEvent && onEvent('bite');
      if (navigator.vibrate) navigator.vibrate(90);
      track.classList.remove('dim');
      msg.textContent = 'BITE!';
      msg.style.color = '#ffce54';
      hint.textContent = 'HOLD to lift the cage — keep the fish inside it!';
      game = new ReelGame(fishId);
      this._reelGame = game;   // (debug/testing handle)
      lastT = performance.now();
      const loop = (now) => {
        if (finished) return;
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        const result = game.update(dt, holding);
        const H = track.clientHeight;
        zone.style.height = game.zoneSize * 100 + '%';
        zone.style.bottom = Math.max(0, Math.min(1 - game.zoneSize, game.zonePos - game.zoneSize / 2)) * 100 + '%';
        zone.classList.toggle('in', !!game.inZone);
        icon.style.bottom = (game.fishPos * (H - 26)) + 'px';
        fill.style.height = (game.progress * 100) + '%';
        if (!result) { raf = requestAnimationFrame(loop); return; }
        // reveal
        cleanup();
        const f = FISH[fishId];
        if (result === 'caught') {
          icon.textContent = f.emoji;
          msg.innerHTML = `${f.emoji} <b style="color:${RARITY_COLOR[f.rarity]}">${f.name}</b>!`;
          hint.textContent = f.flavor;
        } else {
          msg.textContent = 'it slipped back into the dark…';
          msg.style.color = '#9fb4be';
          hint.textContent = 'the pond is patient. so are you.';
        }
        onEvent && onEvent(result);
        setTimeout(() => {
          wrap.classList.add('hidden');
          onDone(result);
        }, result === 'caught' ? 1800 : 1300);
      };
      raf = requestAnimationFrame(loop);
    }, 1100 + Math.random() * 1700);
  },

  // ---------- generic picker (seeds, eggs) ----------
  openPicker(title, options, cb) {
    $('pickertitle').textContent = title;
    const wrap = $('pickerlist');
    wrap.innerHTML = '';
    this._pickerCb = cb;
    if (!options.length) {
      wrap.innerHTML = '<div class="ri-sub" style="text-align:center">Nothing here yet!</div>';
    }
    for (const opt of options) {
      const row = document.createElement('div');
      row.className = 'rowitem';
      row.innerHTML = `<div style="font-size:22px">${opt.emoji}</div>
        <div class="ri-main"><div class="ri-title">${opt.label}</div><div class="ri-sub">${opt.sub || ''}</div></div>`;
      const btn = document.createElement('button');
      btn.textContent = opt.button || 'pick';
      btn.addEventListener('click', () => {
        $('picker').classList.add('hidden');
        const fn = this._pickerCb;
        this._pickerCb = null;
        fn && fn(opt.value);
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    }
    $('picker').classList.remove('hidden');
  },
  closePicker() {
    $('picker').classList.add('hidden');
    this._pickerCb = null;
    this.onPanelClosed && this.onPanelClosed();
  },

  // ---------- the hatch reveal ----------
  showHatch(type) {
    const info = PETS[type];
    const rar = RARITY[info.rarity];
    $('hatchemoji').textContent = info.emoji;
    $('hatchrarity').textContent = rar.name;
    $('hatchrarity').style.color = rar.color;
    $('hatchname').textContent = info.name;
    $('hatchability').textContent = info.ability;
    $('hatch').classList.remove('hidden');
    return new Promise((resolve) => { this._hatchResolve = resolve; });
  },
  setCrosshair(on) {
    document.getElementById('crosshair').classList.toggle('hidden', !on);
  },
  // one pocket button per meal type you're carrying — tap to eat
  setFood(food) {
    const row = document.getElementById('foodrow');
    row.innerHTML = '';
    for (const [id, count] of Object.entries(food)) {
      if (!count) continue;
      const meal = MEALS[id];
      if (!meal) continue;
      const btn = document.createElement('button');
      btn.textContent = `${meal.emoji} ×${count}`;
      btn.addEventListener('click', () => this.onEat && this.onEat(id));
      row.appendChild(btn);
    }
  },
  setHome(dist, angle) {
    if (dist < 25) { this.homeinfo.classList.add('hidden'); return; }
    this.homeinfo.classList.remove('hidden');
    this.homedist.textContent = '⌂ ' + Math.round(dist) + 'm';
    this.homearrow.style.transform = 'rotate(' + (-angle * 180 / Math.PI) + 'deg)';
  },
  setPrompt(label) {
    if (!label) { this.prompt.classList.add('hidden'); return; }
    this.prompt.textContent = label;
    this.prompt.classList.remove('hidden');
  },
  setVignette(level) {
    this.vignette.style.opacity = Math.max(0, Math.min(1, level));
  },

  // ---------- overlays ----------
  flash() {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity 0.45s';
      this.flashEl.style.opacity = '0';
    });
  },
  fade(to, sec) {
    this.fadeEl.style.transition = `opacity ${sec}s`;
    this.fadeEl.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, sec * 1000 + 40));
  },
  toast(msg, ms = 3600) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  },
  showDreamTitle(text) {
    this.dreamtitle.textContent = '“' + text + '”';
    this.dreamtitle.classList.remove('hidden');
    clearTimeout(this._dreamTimer);
    this._dreamTimer = setTimeout(() => this.dreamtitle.classList.add('hidden'), 3600);
  },
  // the dream minigame's one-line scoreboard (null hides it)
  setDreamHud(text) {
    const el = $('dreamhud');
    if (!text) { el.classList.add('hidden'); return; }
    if (el.textContent !== text) el.textContent = text;
    el.classList.remove('hidden');
  },

  // ---------- book ----------
  openBook() {
    // unread books first, then any random book
    const unread = BOOKS.filter((b) => !State.booksRead.includes(b.id));
    const book = (unread.length ? unread : BOOKS)[Math.floor(Math.random() * (unread.length || BOOKS.length))];
    $('booktitle').textContent = book.title;
    $('bookbody').textContent = book.body;
    this.book.classList.remove('hidden');
    return book;
  },

  // ---------- the shop ----------
  openShop() {
    $('shop').classList.remove('hidden');
    this._renderShop();
  },
  closeShop() {
    $('shop').classList.add('hidden');
    this.onShopClosed && this.onShopClosed();
  },
  _renderShop() {
    $('shopmoney').textContent = '🪙 ' + State.money;
    const wrap = $('shopitems');
    wrap.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const owned = item.owned && item.owned();
      const locked = item.locked && item.locked();
      const row = document.createElement('div');
      row.className = 'shopitem';
      const btnLabel = owned ? 'owned' : locked ? 'locked' : `🪙 ${item.price}`;
      row.innerHTML = `
        <div class="si-emoji">${item.emoji}</div>
        <div class="si-info">
          <div class="si-name">${item.name}</div>
          <div class="si-desc">${item.desc}</div>
        </div>`;
      const btn = document.createElement('button');
      btn.textContent = btnLabel;
      btn.disabled = owned || locked || State.money < item.price;
      btn.addEventListener('click', () => {
        const err = purchase(item.id);
        if (err) { this.toast(err); return; }
        this.onPurchase && this.onPurchase(item);
        this._renderShop();
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    }
    // sell harvested crops back to the scarecrow
    const crops = Object.entries(State.inventory.food).filter(([id, n]) => CROPS[id] && n > 0);
    if (crops.length) {
      const total = crops.reduce((sum, [id, n]) => sum + CROPS[id].sell * n, 0);
      const row = document.createElement('div');
      row.className = 'shopitem';
      row.innerHTML = `
        <div class="si-emoji">🧺</div>
        <div class="si-info">
          <div class="si-name">Sell your harvest</div>
          <div class="si-desc">${crops.map(([id, n]) => `${CROPS[id].emoji}×${n}`).join('  ')}</div>
        </div>`;
      const btn = document.createElement('button');
      btn.textContent = `+🪙 ${total}`;
      btn.addEventListener('click', () => {
        for (const [id] of crops) State.inventory.food[id] = 0;
        State.money += total;
        save();
        this.onPurchase && this.onPurchase({ emoji: '🧺', name: 'Harvest sold' });
        this._renderShop();
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    }
  },

  // ---------- therapist chat ----------
  openChat(brain) {
    this._brain = brain;
    document.querySelector('#chathead span').textContent =
      brain.isClaude ? 'DR. UMBRA — THERAPIST ✦' : 'DR. UMBRA — THERAPIST';
    this.chat.classList.remove('hidden');
    this.chatlog.innerHTML = '';
    // replay the last few remembered exchanges
    for (const m of State.chatHistory.slice(-6)) this._bubble(m.who, m.text);
    const opener = brain.opener();
    this._bubble('doc', opener);
    State.chatHistory.push({ who: 'doc', text: opener });
  },
  closeChat() {
    this.chat.classList.add('hidden');
    this.chatinput.blur();
    State.chatHistory = State.chatHistory.slice(-12);
    this.onChatClosed && this.onChatClosed();
  },
  _bubble(who, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + who;
    div.textContent = text;
    this.chatlog.appendChild(div);
    this.chatlog.scrollTop = this.chatlog.scrollHeight;
    return div;
  },
  async _send() {
    const text = this.chatinput.value.trim();
    if (!text || this._thinking) return;
    this.chatinput.value = '';
    this._bubble('user', text);
    State.chatHistory.push({ who: 'user', text });
    this._thinking = true;
    const dots = this._bubble('doc', '…');
    const answer = await this._brain.reply(text);
    dots.textContent = answer;
    this.chatlog.scrollTop = this.chatlog.scrollHeight;
    State.chatHistory.push({ who: 'doc', text: answer });
    this._thinking = false;
  },
};
