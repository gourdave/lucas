// ui.js — all the DOM: HUD, title screen, fades, toasts, the book reader and
// the therapist chat panel. Other modules never touch the DOM directly.

import { State } from './state.js';

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

export const UI = {
  onDrink: null,
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
    $('chatsend').addEventListener('click', () => this._send());
    this.chatinput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._send();
    });
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

  // ---------- therapist chat ----------
  openChat(brain) {
    this._brain = brain;
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
