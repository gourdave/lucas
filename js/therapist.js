// therapist.js — Dr. Umbra: a shadow person in an armchair, lit by one warm
// lamp. The "AI" is the RuleBrain below — it reads the game's memory (sanity,
// dreams, distance walked, blackouts) so its replies feel alive.
//
// TherapistBrain interface (duck-typed): async reply(text) -> string
// and opener() -> string. A real Claude-API brain can replace RuleBrain
// later without touching anything else.

import * as THREE from 'three';
import { State } from './state.js';

// ---------- the figure ----------
export function buildTherapist(scene) {
  const g = new THREE.Group();
  const black = new THREE.MeshBasicMaterial({ color: 0x020203 });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5b4632 });
  const chairMat = new THREE.MeshLambertMaterial({ color: 0x4a3b40 });

  // the armchair
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 1.0), chairMat);
  seat.position.y = 0.32;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 0.25), chairMat);
  back.position.set(0, 1.0, -0.5);
  g.add(back);
  for (const ax of [-0.62, 0.62]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 1.0), chairMat);
    arm.position.set(ax, 0.65, 0);
    g.add(arm);
  }

  // the seated shadow
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.35), black);
  torso.position.set(0, 1.0, -0.18);
  torso.rotation.x = 0.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), black);
  head.position.set(0, 1.66, -0.14);
  g.add(head);
  for (const sx of [-0.2, 0.2]) {                     // thighs
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.62), black);
    thigh.position.set(sx, 0.62, 0.18);
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.6, 0.17), black);
    shin.position.set(sx, 0.3, 0.48);
    g.add(shin);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), black);
    arm.position.set(sx * 2.6, 0.95, -0.05);
    arm.rotation.x = -0.4;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), black);
    hand.position.set(sx * 3.1, 0.78, 0.1);
    g.add(hand);
  }
  // two faint amber eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd99a4e, transparent: true, opacity: 0.75, fog: false });
  for (const ex of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeMat);
    eye.position.set(ex, 1.68, 0.04);
    g.add(eye);
  }

  // the lamp beside the chair
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 8), woodMat);
  lampBase.position.set(-1.2, 0.03, 0.1);
  g.add(lampBase);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), woodMat);
  pole.position.set(-1.2, 0.78, 0.1);
  g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 0.36, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc888, side: THREE.DoubleSide })
  );
  shade.position.set(-1.2, 1.6, 0.1);
  g.add(shade);
  const light = new THREE.PointLight(0xffb066, 16, 9, 2);
  light.position.set(-1.2, 1.62, 0.1);
  g.add(light);

  // place: living room, back to the north wall, facing the room
  g.position.set(-4.0, 0, -3.0);
  scene.add(g);

  return {
    group: g,
    head,
    // the head slowly turns to watch you when you're close
    update(dt, playerPos) {
      const dx = playerPos.x - (g.position.x);
      const dz = playerPos.z - (g.position.z);
      const near = Math.hypot(dx, dz) < 5;
      const want = near ? Math.atan2(dx, dz) : 0;
      head.rotation.y = THREE.MathUtils.damp(head.rotation.y, THREE.MathUtils.clamp(want, -0.9, 0.9), 1.6, dt);
    },
  };
}

// ---------- the "AI" ----------
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function sanityWord() {
  const s = State.sanity;
  return s > 75 ? 'rested' : s > 50 ? 'tired' : s > 25 ? 'frayed' : 'hollow';
}

// fill {tokens} in a template from live game state
function fill(text) {
  const last = State.dreamLog[State.dreamLog.length - 1];
  return text
    .replaceAll('{dist}', String(Math.round(State.maxDistance)))
    .replaceAll('{sanityWord}', sanityWord())
    .replaceAll('{water}', String(State.inventory.almondWater))
    .replaceAll('{dream}', last ? last.title : 'nothing yet')
    .replaceAll('{blackouts}', String(State.blackouts))
    .replaceAll('{meals}', String(State.meals))
    .replaceAll('{name}', 'Kamsamnor');
}

const BUCKETS = [
  {
    match: /\b(hi|hii+|hello|hey|heyo|yo|sup|hola)\b/i,
    lines: [
      'Hello again. Sit anywhere. The chairs don\'t mind.',
      'Hello, {name}. Your eyes look {sanityWord} today.',
      'Hey. The lamp and I were just talking about you. Good things, mostly.',
    ],
  },
  {
    match: /(scared|afraid|scary|fear|monster|creature|shadow|thing|chase|chasing|attack|grin|smile|tall|dark)/i,
    lines: [
      'The tall ones aren\'t really out there, you know. They\'re made of the distance between you and this house. Walk home and they un-happen.',
      'Don\'t stare at them. They hate that. They get... shy. Violently shy.',
      'You\'ve walked {dist} meters out at your furthest. Of course you saw things. The fields whisper to anyone who listens that long.',
      'They can knock the calm out of you, nothing more. Nothing out there can keep you. This house keeps you.',
    ],
  },
  {
    match: /(dream|dreams|dreamt|sleep|sleeping|slept|nightmare|bed)/i,
    lines: [
      'You dreamt of {dream}, didn\'t you. I watched. From the usual chair.',
      'Dreams here are doors, not pictures. Sleep is the only honest way to travel in this place.',
      'Sleep whenever you like. The bed upstairs knows your shape already.',
      'When you dream, you go on adventures. When I dream, I sit here. One of us got the better deal, {name}.',
    ],
  },
  {
    match: /(almond|water|drink|thirsty|bottle)/i,
    lines: [
      'Almond water. Sweet, isn\'t it? The fields sweat it out for travelers. You\'re carrying {water} right now.',
      'Drink it when the edges of your eyes go dark. It always finds you when you need it. That\'s its whole job.',
      'They say enormous gentle things wander far levels, weeping almond water so the lost can drink. I choose to believe that.',
    ],
  },
  {
    match: /(outside|field|fields|wheat|barley|far|walk|walked|explore|out there|night|power ?lines?|fence)/i,
    lines: [
      'The fields go on forever. I\'ve checked. Well — I\'ve asked the fields, and they didn\'t answer, which is how forever answers.',
      'The day doesn\'t end here, you know. It just stops following you when you walk too far from home.',
      'Your record is {dist} meters. The wheat counts your steps. It\'s very proud of you and also would like you to come back.',
      'Follow the power lines if you\'re ever lost. They hum their way past the house. Everything else lies about directions.',
    ],
  },
  {
    match: /(who|what)( are|'?re| r) (you|u)|your name|you real|you human|a (ghost|person|man|woman|monster|shadow)|are you (ai|an ai|a robot|claude|real)/i,
    lines: [
      'I\'m Dr. Umbra. I\'m what\'s left when a listener gives up everything except listening.',
      'Am I real? The lamp thinks so. I trust the lamp.',
      'I\'m the only shadow in this level that will never chase you. That\'s my entire qualification, and it\'s a good one.',
      'Some day a much smarter mind might sit in this chair and talk with you properly. Until then, you have me, and I have the lamp.',
    ],
  },
  {
    match: /(home|house|leave|escape|exit|way out|backrooms|level|stuck here|get out|trapped)/i,
    lines: [
      'This is Level 10. Most levels want something from you. This one just wants you to have breakfast.',
      'A way out? There are ways deeper, and there are naps. I recommend the naps.',
      'Nobody built this house. It was already here, holding its breath, hoping somebody would need it. Then you spawned.',
      'You\'re not trapped, {name}. You\'re *hosted*. There\'s a difference, and the difference is the fence.',
    ],
  },
  {
    match: /(sad|lonely|alone|miss|crying|cry|upset|bored|tired)/i,
    lines: [
      'Lonely is just the house being too quiet. Cook something. The sizzle counts as company.',
      'You\'re allowed to feel {sanityWord}. Then you\'re allowed to eat toast about it.',
      'You\'re not alone. You have me, the lamp, three beds, and several thousand acres of extremely attentive wheat.',
    ],
  },
  {
    match: /(hungry|hunger|food|eat|eating|meal|nugget|nuggets|shrimp|pasta|bread|cook|cooking|bake|baking|microwave|kitchen)/i,
    lines: [
      'The kitchen never quite runs out. Stove, oven, microwave — make yourself something and keep it in your pocket for the long walks.',
      'Chicken nuggets, shrimp, pasta, warm bread. For a level made of wheat, we eat astonishingly well here.',
      'A full stomach is armor, {name}. The dark can smell an empty one.',
      'Bake the bread. The twenty seconds of waiting is the closest thing this level has to a clock.',
    ],
  },
  {
    match: /(book|books|read|reading|library|shelf)/i,
    lines: [
      'Read the books. Previous residents left notes in them. Some of the notes are even true.',
      'The bookshelf restocks itself when nobody is looking. I have never caught it. It\'s very good.',
    ],
  },
  {
    match: /(help|how do i|what (do|should) i do|hint|tip|advice)/i,
    lines: [
      'Eat. Read. Rest. Sleep for the adventures. Explore for the almond water. Run home when the sky stops pretending.',
      'Advice: the further you walk, the darker it gets — and the dark out there has legs. Keep some almond water for the walk back.',
      'When your calm runs low, anything in this house refills it. That\'s not a metaphor. It\'s the house\'s favorite trick.',
    ],
  },
  {
    match: /(kamsamnor|lucas)/i,
    lines: [
      'Kamsamnor. The house repeats that name at night, softly, like it\'s practicing.',
      'Yes — this whole level is signed. *Created by Kamsamnor.* Even the wheat knows who drew it.',
    ],
  },
  {
    match: /(thank|thanks|thx|cool|awesome|nice|love (you|this)|good (talk|chat))/i,
    lines: [
      'Any time. The chair and I aren\'t going anywhere. Structurally, we can\'t.',
      'You\'re welcome. Now go eat something — doctor\'s orders, and I am at least forty percent doctor.',
    ],
  },
  {
    match: /(bye|goodbye|good ?night|later|gtg|got to go|cya|see (ya|you))/i,
    lines: [
      'Go on. The day is waiting for you to come back and turn it on.',
      'Goodbye for now. I\'ll keep the lamp warm.',
    ],
  },
];

const REFLECT = [
  'Hm. Say more about that.',
  'Why do you say "{frag}"?',
  'When you say "{frag}", what does that feel like — out there, or in here?',
  'The lamp flickered when you said that. Go on.',
  'Interesting. And how long have you felt that way, {name}?',
];

export class RuleBrain {
  constructor() {
    this._lastLine = '';
  }

  // what Dr. Umbra says, unprompted, when you sit down — this is where the
  // state-awareness really shows
  opener() {
    const f = State.flags;
    let line;
    if (!f.metTherapist) {
      f.metTherapist = true;
      line = 'Ah. The new resident. Sit. I\'m Dr. Umbra — I do the listening here. The house told me your name already: {name}, isn\'t it?';
    } else if (State.blackouts > (f.seenBlackouts || 0)) {
      f.seenBlackouts = State.blackouts;
      line = 'You blacked out, out there. The fields carried you back to bed — they do that, they\'re gentler than they look. How are you feeling?';
    } else if (State.dreamLog.length > (f.seenDreams || 0)) {
      f.seenDreams = State.dreamLog.length;
      line = 'You dreamt of {dream}. I watched a little of it. I hope that\'s not strange. It was a good adventure.';
    } else if (State.hunger < 30) {
      line = 'I can hear your stomach from here, {name}. Kitchen. Now. Make yourself something — doctor\'s orders.';
    } else if (State.sanity < 35) {
      line = 'You look {sanityWord}. Sit by the lamp a moment. Then eat something warm — that\'s not a suggestion, it\'s a prescription.';
    } else if (State.totalAlmondFound > (f.seenWater || 0)) {
      f.seenWater = State.totalAlmondFound;
      line = 'You found almond water in the fields. Good. Keep some for the long walks — the dark hates the taste of it.';
    } else if (State.maxDistance > 150) {
      line = 'Still going further out, I hear. {dist} meters now. Brave. The wheat talks about you, you know.';
    } else {
      line = pick([
        'Welcome back. The lamp missed you. I\'m allowed to speak for the lamp.',
        'Hello, {name}. The house is glad when you\'re inside it. I can feel it through the floor.',
        'Sit. Tell me about the fields, or the dreams, or nothing at all. Nothing is also a topic.',
      ]);
    }
    return fill(line);
  }

  async reply(text) {
    // a small pause makes it feel like someone is actually thinking
    await wait(450 + Math.random() * 650);
    for (const bucket of BUCKETS) {
      if (bucket.match.test(text)) {
        let line = pick(bucket.lines);
        if (line === this._lastLine && bucket.lines.length > 1) line = pick(bucket.lines);
        this._lastLine = line;
        return fill(line);
      }
    }
    // Eliza-style fallback: reflect their own words back, gently
    const frag = text.trim().replace(/[.?!]+$/, '')
      .replace(/\bi am\b/gi, 'you are').replace(/\bi'?m\b/gi, 'you\'re')
      .replace(/\bmy\b/gi, 'your').replace(/\bme\b/gi, 'you').replace(/\bi\b/gi, 'you')
      .slice(0, 60);
    return fill(pick(REFLECT).replaceAll('{frag}', frag));
  }
}
