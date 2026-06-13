// profanity.js — keep friend chat clean for a 10-year-old and his friends.
// Runs on the CLIENT for the sender's own echo; the WORKER runs an identical
// copy server-side so a hacked client can't get dirty text to anyone else.
// Catches common evasions: leetspeak (sh1t, @ss), spacing/punctuation
// (f.u.c.k), and stretched letters (fuuuck). Not perfect — nothing is — but
// it stops the obvious stuff. KEEP THIS IN SYNC with the copy in proxy/worker.js.

const LEET = { '0':'o','1':'i','2':'z','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','9':'g','@':'a','$':'s','!':'i','+':'t','|':'i' };

// exact-or-collapsed matches (whole words only — avoids the "Scunthorpe" trap)
const BASE = [
  'fuck','shit','bitch','cunt','asshole','ass','arse','dick','piss','bastard',
  'slut','whore','fag','faggot','nigger','nigga','cock','pussy','douche','retard',
  'damn','crap','hell','wtf','stfu','gtfo','prick','twat','wank','bollocks',
  'dumbass','jackass','bullshit','motherfucker','boner','penis','vagina','sex',
  'porn','nazi','kkk','dildo','hoe','skank','tit','tits','pube',
];

// substring matches (only the worst, ones that rarely appear inside clean words)
const HARD = ['fuck','shit','bitch','nigger','nigga','faggot','asshole','motherfuck','bullshit'];

// build the lookup set: each word, plus its collapsed form when that's >=4 chars
const WORDS = new Set();
for (const w of BASE) {
  WORDS.add(w);
  const c = w.replace(/(.)\1+/g, '$1');
  if (c !== w && c.length >= 4) WORDS.add(c);
}

function _norms(token) {
  const low = token.toLowerCase();
  const plain = low.replace(/[^a-z]/g, '');                                  // strip punctuation
  const leet  = low.split('').map((ch) => LEET[ch] || ch).join('').replace(/[^a-z]/g, '');  // de-leet
  return plain === leet ? [plain] : [plain, leet];
}

function _isBad(token) {
  for (const base of _norms(token)) {
    if (!base) continue;
    const coll = base.replace(/(.)\1+/g, '$1');     // fuuuck → fuck
    if (WORDS.has(base) || WORDS.has(coll)) return true;
    for (const w of HARD) { if (base.includes(w) || coll.includes(w)) return true; }
  }
  return false;
}

// replace any bad token with asterisks, preserving spacing
export function clean(text) {
  return String(text).split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    return _isBad(tok) ? '*'.repeat(Math.min(tok.length, 15)) : tok;
  }).join('');
}
