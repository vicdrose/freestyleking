/**
 * Freestyle King — application controller.
 *
 * Hybrid approach: Vue 3 (loaded via CDN) provides the app/reactive layer,
 * Ionic web components (loaded via CDN) provide the modern UI. The core
 * Freestyle King logic (word randomizers, Datamuse relationships, quotes,
 * Tone.js audio) is wired imperatively against the Ionic markup in index.html.
 *
 * All data + services are bundled by Vite as ES modules.
 */
import {
  items, words1, adjectives, adverbs, verbs, celebs, athletes,
  movies, emotions, flavors, questions,
  A, ah, E, eh, I, ih, O, U, uh, owh
} from './data/index.js';
import { getSynonyms, getSoundsLike, getRhymes, getForismaticQuote } from './services/api.js';
import { initAudio } from './services/audio.js';
import * as Tone from 'tone';
import { getBeatShuffler, getPad, getBreak, getBeat, getFKBeat, getBass, getSFX, getFill, loadSampleDirs } from './services/samples.js';
import { fetchFeed, playSong, isFeedPlaying, stopFeed } from './services/feed.js';

const Vue = window.Vue;

const resultEl = document.getElementById('result');

function random_item(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function setResult(value) {
  resultEl.innerHTML = value;
  UpdateWords();
}

// ---------- Word Randomizers ----------
function roll() { setResult(random_item(items)); }
function rollCommon() { setResult(random_item(words1)); }
function rollAdj() { setResult(random_item(adjectives)); }
function rollAdv() { setResult(random_item(adverbs)); }
function rollVerbs() { setResult(random_item(verbs)); }
function rollCeleb() { setResult(random_item(celebs)); }
function rollAth() { setResult(random_item(athletes)); }
function rollMov() { setResult(random_item(movies)); }
function rollEmo() { setResult(random_item(emotions)); }
function rollFla() { setResult(random_item(flavors)); }
function rollQue() { setResult(random_item(questions)); }

function randomA() { setResult(random_item(A)); }
function randomE() { setResult(random_item(E)); }
function randomI() { setResult(random_item(I)); }
function randomO() { setResult(random_item(O)); }
function randomU() { setResult(random_item(U)); }
function randomah() { setResult(random_item(ah)); }
function randomeh() { setResult(random_item(eh)); }
function randomih() { setResult(random_item(ih)); }
function randomuh() { setResult(random_item(uh)); }
function randomowh() { setResult(random_item(owh)); }

// ---------------------------------------------------------------------------
// Autorap word source (signified by the tiny black "X" on the buttons)
//
// The rap-grid buttons marked with a black superscript X (Auto Wrap included)
// are the eligible single-word buckets. Celebrity, Athlete, Movie do NOT get
// an X because they are not single words the word API can use.
//
// The last X-marked button pressed is QUEUED as the word source that Auto Wrap
// draws from, so Auto Wrap "auto wraps" from whichever bucket you most recently
// rolled. It defaults to Random Word (words1) until another bucket is pressed.
// ---------------------------------------------------------------------------
let autorapQueue = { rollFn: random_item, seeds: words1, label: 'random' };
// Support hook: console/automation can inspect the queued Auto Wrap source.
window.__autorapQueue = () => ({ ...autorapQueue });

function queueAutorapSource(rollFn, seeds, baseRoll, label) {
  return () => {
    autorapQueue = { rollFn, seeds, label };
    baseRoll();
  };
}
// ---------- Word relationship API (Datamuse) ----------
const modal1 = document.getElementById('relationshipModal');
const modal2 = document.getElementById('slModal');
const modal3 = document.getElementById('synModal');

const wordStage = document.getElementById('wordstage');
const stageList = document.getElementById('stageList');
const stageHead = document.getElementById('stageHead');
const stageWord = document.getElementById('stageWord');

function stageOpen() {
  if (!wordStage) return;
  wordStage.classList.add('ws-open');
  wordStage.setAttribute('aria-hidden', 'false');
}

function stageClose() {
  if (!wordStage) return;
  wordStage.classList.remove('ws-open');
  wordStage.setAttribute('aria-hidden', 'true');
  syncStageWord();
}

// Reflect whatever word is currently in #result into the stage center.
function syncStageWord() {
  if (!stageWord) return;
  stageWord.textContent = resultEl.innerHTML || '';
}

function fillPanel(panel, data) {
  if (!panel) return;
  panel.innerHTML = '';
  data.forEach((element) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ws-chip';
    chip.textContent = element.word;
    chip.addEventListener('click', () => other2(element.word));
    panel.appendChild(chip);
  });
}

const STAGE_LABELS = { rhy: 'Rhymes', sl: 'Sounds like', syn: 'Synonyms' };
let activeSection = 'rhy';
let stageHeld = false;

function sectionWords(sec, word) {
  if (sec === 'sl') return getSoundsLike(word);
  if (sec === 'syn') return getSynonyms(word);
  return getRhymes(word);
}

function showStageSection(sec, word) {
  activeSection = sec;
  if (stageWord) stageWord.textContent = word;
  if (stageHead) stageHead.textContent = STAGE_LABELS[sec];
  [['stageCatRhy', 'rhy'], ['stageCatSl', 'sl'], ['stageCatSyn', 'syn']].forEach(([id, s]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', s === sec);
  });
  sectionWords(sec, word).then((data) => fillPanel(stageList, data));
}

function openStage(sec) {
  showStageSection(sec, resultEl.innerHTML || '');
  stageOpen();
}

function loadRelationships() {
  const Input = resultEl.innerHTML;

  document.getElementById('rhyres').innerHTML = '';
  document.getElementById('synres').innerHTML = '';
  document.getElementById('slres').innerHTML = '';

  getSynonyms(Input).then((data) => {
    const synres = document.getElementById('synres');
    data.forEach((element) => {
      const span = document.createElement('span');
      span.textContent = element.word;
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => other2(element.word));
      synres.appendChild(span);
      synres.appendChild(document.createTextNode(' - '));
    });
  });

  getSoundsLike(Input).then((data) => {
    const slres = document.getElementById('slres');
    data.forEach((element) => {
      const span = document.createElement('span');
      span.textContent = element.word;
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => other2(element.word));
      slres.appendChild(span);
      slres.appendChild(document.createTextNode(' - '));
    });
  });

  getRhymes(Input).then((data) => {
    const rhyres = document.getElementById('rhyres');
    data.forEach((element) => {
      const span = document.createElement('span');
      span.textContent = element.word;
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => other2(element.word));
      rhyres.appendChild(span);
      rhyres.appendChild(document.createTextNode(' - '));
    });
  });
}

function UpdateWords() {
  loadRelationships();
}

function other2(Input) {
  resultEl.innerHTML = Input;
  loadRelationships();

  // Mirror the new word into whichever relationship surface is open and re-search it immediately.
  if (autoStage && autoStage.classList.contains('as-open')) {
    autorap.render(Input);
  } else if (wordStage && wordStage.classList.contains('ws-open')) {
    showStageSection(activeSection, Input);
  }

  modal1.style.display = 'none';
  modal2.style.display = 'none';
  modal3.style.display = 'none';
}

// ---------- Quote System (Forismatic) ----------
let quote = '';
let author = '';

function getNewQuote() {
  getForismaticQuote()
    .then((response) => {
      quote = response.quoteText;
      author = response.quoteAuthor;
      const text = '"' + quote + '"';
      const byline = author ? '- ' + author : '- unknown';
      const q = document.getElementById('quote');
      const a = document.getElementById('author');
      if (q) q.textContent = text;
      if (a) a.textContent = byline;
    })
    .catch(() => {});
}

// ---------- Modals ----------
function setupModal(modal, closeClass, openId) {
  const btn = document.getElementById(openId);
  const span = document.getElementsByClassName(closeClass)[0];
  if (btn) {
    btn.onclick = (e) => { e.preventDefault(); modal.style.display = 'block'; };
  }
  if (span) {
    span.onclick = () => { modal.style.display = 'none'; };
  }
}

// ---------- Autorap (dedicated split-screen overlay + auto-advance timer) ----------
const autoStage = document.getElementById('autostage');
const autoSyn = document.getElementById('autoSyn');
const autoRhy = document.getElementById('autoRhy');
const autoWord = document.getElementById('autoWord');
const autoBucket = document.getElementById('autoBucket');
const asSeconds = document.getElementById('asSeconds');
const asMult = document.getElementById('asMult');
const asClock = document.getElementById('asClock');
const asPause = document.getElementById('asPause');

const autorap = {
  timer: null,
  rollFn: null,
  base: 8,
  mult: 1,
  current: 0,
  paused: false,

  effectiveMs() {
    return Math.max(300, (this.base * this.mult) * 1000);
  },

  updateClock() {
    if (asClock) asClock.textContent = Math.round(this.effectiveMs() / 1000) + 's';
  },

  setPaused(p) {
    this.paused = p;
    if (p) { this.stop(); }
    if (asPause) {
      asPause.title = p ? 'Resume' : 'Pause on this word';
      asPause.innerHTML = p ? '&#9654;' : '&#10074;&#10074;';
    }
    if (!p) this.schedule();
  },

  open(rollFn, seeds, label) {
    this.stop();
    this.paused = false;
    if (asPause) {
      asPause.title = 'Pause on this word';
      asPause.innerHTML = '&#10074;&#10074;';
    }
    this.rollFn = rollFn;
    this.seeds = seeds;
    this.label = label || '';
    if (autoBucket) autoBucket.textContent = this.label;
    if (asSeconds) this.base = Math.max(1, parseInt(asSeconds.value, 10) || 8);
    if (asMult) this.mult = parseFloat(asMult.value) || 1;
    this.updateClock();

    // Show the overlay up front.
    if (autoStage) {
      autoStage.classList.add('as-open');
      autoStage.setAttribute('aria-hidden', 'false');
    }

// Seed the first word with whatever is already in the center (no jarring
    // switch), then auto-advance from the chosen bucket every interval.
    this.render(this.currentWord());
    this.schedule();
  },

  schedule() {
    this.stop();
    if (this.paused) return;
    const ms = this.effectiveMs();
    this.timer = setInterval(() => {
      this.advance();
    }, ms);
  },

advance() {
    // Keep drawing from the bucket chosen in open() (the queued Auto Wrap source) so
    // Skip / the interval never fall back to a hardcoded list.
    const seeds = (this.seeds && this.seeds.length) ? this.seeds : words1;
    this.render(random_item(seeds));
  },

  currentWord() {
    const w = resultEl ? String(resultEl.innerHTML || '').trim() : '';
    if (w) return w;
    const seeds = (this.seeds && this.seeds.length) ? this.seeds : words1;
    return random_item(seeds);
  },

  render(word) {
    if (autoWord) autoWord.textContent = word;
    getSynonyms(word).then((data) => fillPanel(autoSyn, data));
    getRhymes(word).then((data) => fillPanel(autoRhy, data));
  },

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  close() {
    this.stop();
    if (autoStage) {
      autoStage.classList.remove('as-open');
      autoStage.setAttribute('aria-hidden', 'true');
    }
  },

  wire() {
    try {
      const savedSec = localStorage.getItem('fk-asSeconds');
      if (savedSec && asSeconds) asSeconds.value = savedSec;
      const savedMult = localStorage.getItem('fk-asMult');
      if (savedMult && asMult) asMult.value = savedMult;
    } catch (e) {}
    if (asSeconds) {
      asSeconds.addEventListener('change', () => {
        this.base = Math.max(1, parseInt(asSeconds.value, 10) || 8);
        this.updateClock();
        this.schedule();
        try { localStorage.setItem('fk-asSeconds', asSeconds.value); } catch (err) {}
      });
    }
    if (asMult) {
      asMult.addEventListener('input', () => {
        this.mult = parseFloat(asMult.value) || 1;
        this.updateClock();
        this.schedule();
        try { localStorage.setItem('fk-asMult', asMult.value); } catch (err) {}
      });
    }
    const skipBtn = document.getElementById('asSkip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.advance();
        if (!this.paused) this.schedule();
      });
    }
    if (asPause) {
      asPause.addEventListener('click', () => this.setPaused(!this.paused));
    }
    const closeBtn = document.getElementById('asClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Phonetics rows: tap a sound to auto-rap within that phoneme group.
    const phonMap = [
      ['ariaA', A], ['ariaE', E], ['ariaI', I], ['ariaO', O], ['ariaU', U],
      ['ariaah', ah], ['ariaeh', eh], ['ariaih', ih], ['ariaowh', owh], ['ariauh', uh]
    ];
    phonMap.forEach(([id, list]) => {
      const b = document.getElementById(id);
      if (b) {
        b.addEventListener('click', () => {
          this.render(random_item(list));
          if (!this.paused) this.schedule();
        });
      }
    });
  }
};

function autorap1() {
  autorap.open(autorapQueue.rollFn, autorapQueue.seeds, autorapQueue.label);
}

function autorapverbs() {
  autorap.open(random_item, verbs, 'verbs');
}

function autorapadv() {
  autorap.open(random_item, adverbs, 'adverb');
}

function autorapadj() {
  autorap.open(random_item, adjectives, 'adjective');
}

// Support hook: inspect the actual bucket Auto Wrap is drawing from.
window.__autorapSeeds = () => autorap.seeds || words1;

// ---------- Beat view: Player / Beats / Keys & Sounds / Recorder ----------
function beatToggles() {
  const groups = [
    ['chk-beat-player', 'beat-pane-player'],
    ['chk-beat-keys', 'beat-pane-keys'],
    ['chk-beat-recorder', 'beat-pane-recorder']
  ];
  groups.forEach(([chkId, paneId]) => {
    const chk = document.getElementById(chkId);
    const pane = document.getElementById(paneId);
    if (!chk || !pane) return;
    const apply = (checked) => { pane.style.display = checked ? 'block' : 'none'; };
    apply(!!chk.checked);
    chk.addEventListener('ionChange', (e) => apply(!!e.detail.checked));
  });

  // Keep the gold "on" tint on a row while its section is enabled.
  document.querySelectorAll('.beat-acc-row').forEach((row) => {
    const chk = row.querySelector('ion-toggle');
    if (!chk) return;
    const sync = () => row.classList.toggle('on', !!chk.checked);
    sync();
    chk.addEventListener('ionChange', sync);
  });
}

// ---------- Piano (Keys & Sounds) ----------
function setupPiano(sampler) {
  const el = document.getElementById('pianoKeys');
  if (!el) return;

  const octaves = [3, 4, 5, 6];
  const whiteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const blackSpec = [['C#', 0], ['D#', 1], ['F#', 3], ['G#', 4], ['A#', 5]];
  const naturals = [];
  octaves.forEach((oct) => whiteNames.forEach((name) => naturals.push(name + oct)));

  const nWhites = naturals.length;
  const whiteW = 100 / nWhites;
  const blackW = whiteW * 0.65;

// When a PAD/BASS/SFX/Fill sample is loaded, the keys pitch-shift that sample;
  // otherwise they stay silent (no built-in test tones).
  const down = (note, vel = 1) => {
    if (sampler && sampler.loaded) sampler.triggerAttack(note, undefined, vel);
  };
  const up = (note) => {
    if (sampler && sampler.loaded) sampler.triggerRelease(note);
  };

  naturals.forEach((note) => {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'piano-key white';
    key.textContent = note;
    key.addEventListener('pointerdown', () => down(note));
    key.addEventListener('pointerup', () => up(note));
    key.addEventListener('pointerleave', () => up(note));
    el.appendChild(key);
  });

  let octStart = 0;
  octaves.forEach((oct) => {
    blackSpec.forEach(([name, li]) => {
      const note = name + oct;
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'piano-key black';
      key.textContent = note.replace('#', '\u266F');
      key.style.left = (((octStart + li + 1) * whiteW) - (blackW / 2)) + '%';
      key.style.width = blackW + '%';
      key.addEventListener('pointerdown', () => down(note));
      key.addEventListener('pointerup', () => up(note));
      key.addEventListener('pointerleave', () => up(note));
      el.appendChild(key);
    });
octStart += 7;
  });

  // Computer-keyboard piano (classic Virtual Piano layout):
  // whites A S D F G H J K L, blacks W E T Y U O P, starting at C4.
  // Z/X shift the octave down/up; C/V lower/raise velocity in steps of 10 (0-127).
  const octaveOffsets = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
    KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13,
    KeyL: 14, KeyP: 15
  };
  let keyOctave = 4;
  let keyVelocity = 125;
  const noteFor = (code) =>
    Tone.Frequency('C4').transpose((keyOctave - 4) * 12 + octaveOffsets[code]).toNote();
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyZ') return keyOctave--;
    if (e.code === 'KeyX') return keyOctave++;
    if (e.code === 'KeyC') return keyVelocity = Math.max(0, keyVelocity - 10);
    if (e.code === 'KeyV') return keyVelocity = Math.min(127, keyVelocity + 10);
    if (octaveOffsets[e.code] !== undefined) down(noteFor(e.code), keyVelocity / 127);
  });
  window.addEventListener('keyup', (e) => {
    if (octaveOffsets[e.code] !== undefined) up(noteFor(e.code));
  });
  window.addEventListener('blur', () => {
    Object.keys(octaveOffsets).forEach((code) => up(noteFor(code)));
  });

  const midiSel = document.getElementById('midiIn');
  if (midiSel && navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then((access) => {
      const inputs = [];
      access.inputs.forEach((input) => {
        inputs.push({ id: input.id, input });
        const opt = document.createElement('option');
        opt.value = input.id;
        opt.textContent = input.name || input.id;
        midiSel.appendChild(opt);
      });
      const wire = () => {
        inputs.forEach(({ id, input }) => {
          input.onmidimessage = midiSel.value === id ? (evt) => {
            if (!evt.data) return;
            const cmd = evt.data[0];
            const note = evt.data[1];
            const vel = evt.data[2];
            const name = Tone.Frequency(note, 'midi').toNote();
            if (cmd >= 144 && cmd < 160) {
              if (vel > 0) down(name); else up(name);
            } else if (cmd >= 128 && cmd < 144) {
              up(name);
            }
          } : null;
        });
      };
      midiSel.addEventListener('change', wire);
    }).catch(() => {});
  }
}

// ---------- Wire up all UI (called from Vue mounted) ----------
function wireUI() {
  const audio = initAudio();
  const { player, playerGain, sampler, recorder, mic, micFFT, beatGain, beatPlayer, beatEl, samplerGain } = audio;

// Pull the real sample lists from the host (falls back to bundled placeholders).
  const dirsPromise = loadSampleDirs();

  // Word buttons
  document.getElementById('btn-roll').onclick = queueAutorapSource(random_item, items, roll, 'common');
  document.getElementById('btn-rollCommon').onclick = queueAutorapSource(random_item, words1, rollCommon, 'random');
  document.getElementById('btn-rollAdj').onclick = queueAutorapSource(random_item, adjectives, rollAdj, 'adjective');
  document.getElementById('btn-rollAdv').onclick = queueAutorapSource(random_item, adverbs, rollAdv, 'adverb');
  document.getElementById('btn-rollVerbs').onclick = queueAutorapSource(random_item, verbs, rollVerbs, 'verbs');
  document.getElementById('btn-rollCeleb').onclick = rollCeleb;
  document.getElementById('btn-rollAth').onclick = rollAth;
  document.getElementById('btn-rollMov').onclick = rollMov;
  document.getElementById('btn-rollEmo').onclick = queueAutorapSource(random_item, emotions, rollEmo, 'emotions');
  document.getElementById('btn-rollFla').onclick = queueAutorapSource(random_item, flavors, rollFla, 'flavors');
  document.getElementById('btn-rollQue').onclick = rollQue;

  // Vowel buttons
  document.getElementById('btn-randomA').onclick = randomA;
  document.getElementById('btn-randomE').onclick = randomE;
  document.getElementById('btn-randomI').onclick = randomI;
  document.getElementById('btn-randomO').onclick = randomO;
  document.getElementById('btn-randomU').onclick = randomU;
  document.getElementById('btn-randomah').onclick = randomah;
  document.getElementById('btn-randomeh').onclick = randomeh;
  document.getElementById('btn-randomih').onclick = randomih;
  document.getElementById('btn-randomowh').onclick = randomowh;
  document.getElementById('btn-randomuh').onclick = randomuh;

  // Modal frame for Show Quote
  setupModal(document.getElementById('quotal'), 'close4', 'quptalbtn');

// Rhymes / Sounds like / Synonyms (the relationship buttons) all open the same stage.
  const stageCatRhy = document.getElementById('stageCatRhy');
  const stageCatSl = document.getElementById('stageCatSl');
  const stageCatSyn = document.getElementById('stageCatSyn');

  let pressInfo = null;
  const quickTapMs = 250;
  const bindStageButton = (el, sec) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pressInfo = { id: e.pointerId, t: Date.now() };
      stageHeld = false;
      openStage(sec);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        stageHeld = true;
        openStage(sec);
      }
    });
  };
  const resolvePress = (id) => {
    if (!pressInfo || pressInfo.id !== id) return;
    const wasQuick = (Date.now() - pressInfo.t) < quickTapMs;
    pressInfo = null;
    if (stageHeld) return;
    if (wasQuick) stageHeld = true; // two-tap: quick tap stays open
    else stageClose();              // long hold released without Hold = peek ends
  };
  document.addEventListener('pointerup', (e) => resolvePress(e.pointerId));
  document.addEventListener('pointercancel', (e) => resolvePress(e.pointerId));

  bindStageButton(document.getElementById('relationshipBtn'), 'rhy');
  bindStageButton(document.getElementById('slBtn'), 'sl');
  bindStageButton(document.getElementById('synBtn'), 'syn');
  bindStageButton(stageCatRhy, 'rhy');
  bindStageButton(stageCatSl, 'sl');
  bindStageButton(stageCatSyn, 'syn');

const stageCloseBtn = document.getElementById('stageCloseBtn');
  if (stageCloseBtn) {
    stageCloseBtn.addEventListener('click', () => {
      stageHeld = false;
      stageClose();
    });
  }

  // Phonetic buttons: pick a word with that sound, then refresh the open list.
  const wirePhon = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => {
      fn();
      if (wordStage && wordStage.classList.contains('ws-open')) {
        showStageSection(activeSection, resultEl.innerHTML || '');
      }
    });
  };
  wirePhon('stagePhonA', randomA);
  wirePhon('stagePhonE', randomE);
  wirePhon('stagePhonI', randomI);
  wirePhon('stagePhonO', randomO);
  wirePhon('stagePhonU', randomU);
  wirePhon('stagePhonAh', randomah);
  wirePhon('stagePhonEh', randomeh);
  wirePhon('stagePhonIh', randomih);
  wirePhon('stagePhonOwh', randomowh);
  wirePhon('stagePhonUh', randomuh);

  // Close the stage when tapping anywhere outside the panels.
  if (wordStage) {
    wordStage.addEventListener('click', (e) => {
      if (e.target === wordStage) {
        stageHeld = false;
        stageClose();
      }
    });
  }
  // Quote
  document.getElementById('quoteBtn').onclick = (e) => { e.preventDefault(); getNewQuote(); };
  document.getElementById('shareQuote').onclick = (e) => {
    e.preventDefault();
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent('"' + quote + '"' + '- ' + author));
  };
  getNewQuote();

  // Studio rack sliders: rate (0.5-1.5 centered at 1) and volume (0-100 -> dB).
  // Wrapped so a hiccup in the player rack can never take down the rest of init.
  try {
    const rateSlider = document.getElementById('rateSlider');
    const rateVal = document.getElementById('rateVal');
    if (rateSlider && rateVal) {
      const syncRate = () => {
        const v = parseFloat(rateSlider.value) || 1;
        rateVal.textContent = v.toFixed(2) + 'x';
        player.playbackRate = v;
      };
      rateSlider.addEventListener('input', syncRate);
      syncRate();
    }

    const volSlider = document.getElementById('volSlider');
    const volVal = document.getElementById('volVal');
    if (volSlider && volVal) {
      const syncVol = () => {
        const v = parseFloat(volSlider.value) || 100;
        volVal.textContent = v;
        // Drive the beat player's dedicated gain (linear 0-1). player.volume
        // is read-only in Tone 14, so it never adjusted loudness before.
        if (playerGain) playerGain.gain.value = v / 100;
      };
      volSlider.addEventListener('input', syncVol);
      syncVol();
    }
  } catch (e) {}

  const abVol = document.getElementById('autoBeatVolRange');
  const abOut = document.getElementById('autoBeatVolOut');
  if (abVol) {
    abOut.innerHTML = abVol.value || 100;
    beatGain.gain.value = (abVol.value || 100) / 100;
    abVol.addEventListener('ionChange', () => {
      abOut.innerHTML = abVol.value;
      beatGain.gain.value = (abVol.value || 100) / 100;
    });
  }

  const samplerVol = document.getElementById('samplerVolRange');
  const samplerVolOut = document.getElementById('samplerVolOut');
  if (samplerVol && samplerVolOut) {
    const syncSamplerVol = () => {
      samplerVolOut.innerHTML = samplerVol.value || 100;
      samplerGain.gain.value = (samplerVol.value || 100) / 100;
    };
    syncSamplerVol();
    // Native range fires 'input'; ion-range fires 'ionChange' - support both.
    samplerVol.addEventListener('input', syncSamplerVol);
    samplerVol.addEventListener('ionChange', syncSamplerVol);
  }
  window.__reprobe = () => {
    const el = document.getElementById('autoBeatAudio');
    return {
      beatSrc: el ? el.src : '',
      beatPlaying: el ? !el.paused : false,
      beatVol: beatGain.gain.value,
      samplerVol: samplerGain.gain.value,
recState: recorder.state
    };
  };

  try { wirePlayerToggle(); } catch (e) {}
    try { wireRepeatOnce(); } catch (e) {}
    try { wireMenuButtons(); } catch (e) {}
    try { wireSeek(); } catch (e) {}
    try { wirePlayerPref(); } catch (e) {}
    try { wireInfoFlip(); } catch (e) {}
    try { initFkLayout(); } catch (e) {}

  // Browsers leave the AudioContext suspended until a user gesture unlocks it.
  const unlock = () => Tone.start().catch(() => {});

  const setState = (state) => { document.body.dataset.playerState = state; };

  // Custom URL loader shared by the player and sampler rack modules. Pasting a
  // freestyleking theme URL works around the fact that raw .wav/.mp3 files are
  // served without CORS headers (which Tone needs), so route URLs under
  // wp-content/themes/thrive-nouveau/ through the CORS-enabled list.php proxy
  // the source buttons use. Returns null for non-theme URLs (leave them as-is).
  const toProxy = (rawUrl) => {
    const marker = 'wp-content/themes/thrive-nouveau/';
    const i = rawUrl.indexOf(marker);
    if (i < 0) return null;
    let path = rawUrl.slice(i + marker.length);
    try { path = decodeURIComponent(path); } catch (e) { /* leave as-is */ }
    const rel = './wp-content/themes/thrive-nouveau/' + path;
    return 'https://freestylekingapp.com/wp-content/themes/thrive-nouveau/list.php?get=' + encodeURIComponent(rel);
  };

  // Studio rack player (play/pause toggle, static waveform, source selector, URL loader).
  // Guarded so a player-rack error cannot break sampler/recorder/other init.
  try {
  const urlStatus = document.getElementById('url');
  const waveCanvas = document.getElementById('waveCanvas');
  const waveStatus = document.getElementById('waveStatus');
  const playBtn = document.getElementById('btnPlayerPlay');
  const playIcon = document.getElementById('playerPlayIcon');
  const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;
  let queuedUrl = null;
  let loadedLabel = '';

  // Render a static waveform from an AudioBuffer, SP-404 style.
  const renderWaveform = (buffer) => {
    if (!waveCanvas || !waveCtx || !buffer) return;
    const data = buffer.getChannelData(0);
    const w = waveCanvas.clientWidth || waveCanvas.width;
    const h = waveCanvas.height;
    waveCanvas.width = w;
    const step = Math.ceil(data.length / w);
    const amp = h / 2;
    waveCtx.clearRect(0, 0, w, h);
    waveCtx.fillStyle = 'rgba(210, 180, 140, 0.06)';
    waveCtx.fillRect(0, 0, w, h);
    waveCtx.beginPath();
    waveCtx.moveTo(0, amp);
    for (let i = 0; i < w; i++) {
      let mn = 1, mx = -1;
      for (let j = 0; j < step; j++) {
        const v = data[i * step + j];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      waveCtx.lineTo(i, amp + mn * amp);
      waveCtx.lineTo(i, amp + mx * amp);
    }
    waveCtx.strokeStyle = '#d2b48c';
    waveCtx.lineWidth = 1.6;
    waveCtx.stroke();
    if (waveStatus) waveStatus.textContent = '· ' + (loadedLabel || 'loaded') + ' ·';
  };

  // Draw a flat baseline when nothing is loaded yet.
  const clearWaveform = () => {
    if (!waveCanvas || !waveCtx) return;
    const w = waveCanvas.clientWidth || waveCanvas.width;
    const h = waveCanvas.height;
    waveCanvas.width = w;
    waveCtx.clearRect(0, 0, w, h);
    waveCtx.fillStyle = 'rgba(210, 180, 140, 0.06)';
    waveCtx.fillRect(0, 0, w, h);
    waveCtx.beginPath();
    waveCtx.moveTo(0, h / 2);
    waveCtx.lineTo(w, h / 2);
    waveCtx.strokeStyle = 'rgba(210, 180, 140, 0.35)';
    waveCtx.lineWidth = 1;
    waveCtx.stroke();
  };
  clearWaveform();

  const setActiveSource = (btn) => {
    document.querySelectorAll('.source-btn').forEach((b) => b.classList.remove('source-active'));
    if (btn) btn.classList.add('source-active');
  };

  // Load a loop into the player, mirror status onto the URL line, render waveform.
  const loadPlayer = (url, label) => {
    queuedUrl = url;
    loadedLabel = label || url;
    if (urlStatus) urlStatus.innerHTML = (label || url) + ' - loading';
    player.stop();
    setState('loading');
    if (playIcon) playIcon.setAttribute('name', 'play');
    return unlock()
      .then(() => player.load(url))
      .then((buf) => {
        document.body.dataset.bufferLoaded = '1';
        setState('loaded');
        if (urlStatus) urlStatus.innerHTML = (label || url) + ' - ready';
        if (waveStatus) waveStatus.textContent = 'Loaded · ' + (label || '') + ' ·';
        if (waveCanvas && buf && typeof buf.getChannelData === 'function') {
          renderWaveform(buf);
        } else if (player.buffer) {
          renderWaveform(player.buffer.get());
        }
        return true;
      })
      .catch(() => {
        setState('loadfailed');
        if (urlStatus) urlStatus.innerHTML = (label || url) + ' - could not load';
        return false;
      });
  };

  playBtn.onclick = async () => {
    if (queuedUrl && !(player.buffer && player.buffer.loaded)) {
      await unlock();
      const ok = await loadPlayer(queuedUrl, loadedLabel || queuedUrl);
      if (!ok) return;
    }
    if (!(player.buffer && player.buffer.loaded)) {
      if (urlStatus) urlStatus.innerHTML = 'Load a sample first';
      return;
    }
    await unlock();
    if (player.state === 'started') {
      player.stop();
      setState('stopped');
      if (playIcon) playIcon.setAttribute('name', 'play');
    } else {
      player.start();
      setState('started');
      if (playIcon) playIcon.setAttribute('name', 'pause');
      if (urlStatus) urlStatus.innerHTML = (urlStatus.innerHTML || '').replace(' - ready', ' - looping');
    }
  };

  // Custom URL loader (uses shared toProxy defined above).
  document.getElementById('btn-sendUrl').onclick = () => {
    const raw = (document.querySelector('#audioUrl').value || '').trim();
    if (!raw) return;
    setActiveSource(null);
    const url = toProxy(raw) || raw;
    loadPlayer(url, raw);
  };

  // Loop buttons load straight into the player; the play button then plays it.
  const wireSource = (id, get, label) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.onclick = () => {
      setActiveSource(btn);
      const { rel, url } = get();
      loadPlayer(url, label + ': ' + rel);
    };
  };
  wireSource('btn-rollBeats', getBeat, 'CLASSICS');
  wireSource('btn-rollBreak', getBreak, 'DRUM LOOP');
  wireSource('btn-rollFKBeats', getFKBeat, 'FK BEATS');
  } catch (e) {}

  // Sample buttons unlock audio with the tap so the keys are audible (no test tones).
  const loadSample = (get) => {
    unlock();
    const { rel, url } = get();
    sampler.add('C4', url);
    const u2 = document.querySelector('#url2');
    if (u2) u2.innerHTML = rel;
    const st = document.getElementById('samplerUrlStatus');
    if (st) st.textContent = 'Loaded: ' + rel;
  };
  document.getElementById('btn-rollSample').onclick = () => loadSample(getPad);
  document.getElementById('btn-rollBass').onclick = () => loadSample(getBass);
  document.getElementById('btn-rollSFX').onclick = () => loadSample(getSFX);
  document.getElementById('btn-rollFills').onclick = () => loadSample(getFill);

  // Sampler rack custom URL loader: loads any pasted audio into the C4 slot so
  // the piano keys play it, mirroring the source pads. Routes theme URLs through
  // the shared CORS proxy so rare raw files decode.
  const samplerUrlBtn = document.getElementById('btn-samplerUrl');
  const samplerUrlInput = document.getElementById('samplerUrl');
  const samplerUrlStatus = document.getElementById('samplerUrlStatus');
  if (samplerUrlBtn && samplerUrlInput) {
    samplerUrlBtn.onclick = () => {
      const raw = (samplerUrlInput.value || '').trim();
      if (!raw) return;
      unlock();
      const url = toProxy(raw) || raw;
      sampler.add('C4', url);
      if (samplerUrlStatus) samplerUrlStatus.textContent = raw;
      const u2 = document.querySelector('#url2');
      if (u2) u2.innerHTML = raw;
    };
  }

  // Recording — starts/stops the two-track take (beat bus + vox bus).
  // Auto-opens the mic first so both buses have live tracks before the
  // recorders start (also fires the permission prompt at the right gesture).
  document.getElementById('btn-record').onclick = () => {
    unlock();
    mic.open().then(() => recorder.start()).catch(() => {});
  };
  document.getElementById('btn-stopRecord').onclick = () => {
    recorder.stop();
    const ab = document.getElementById('autoBeatAudio');
    if (ab) ab.pause();
  };

  // ---- Surgery: align the vox take to the beat take, then combine ----
  const surgeryUI = (() => {
    const el = (id) => document.getElementById(id);
    return {
      play: el('btn-surgeryPlay'),
      input: el('surgeryOffsetInput'),
      slider: el('surgeryOffsetSlider'),
      combine: el('btn-surgeryCombine'),
      status: el('surgeryStatus')
    };
  })();

  if (surgeryUI.play) {
    let takeBeatBuf = null;
    let takeMicBuf = null;
    let prCtx = null;
    let prSources = [];
    let playing = false;
    const offset = { value: 0 };
    const clamp = (v) => Math.max(-500, Math.min(500, Math.round(Number(v) || 0)));
    const setStatus = (m) => { if (surgeryUI.status) surgeryUI.status.textContent = m; };
    const setEnabled = (v) => {
      [surgeryUI.play, surgeryUI.input, surgeryUI.slider, surgeryUI.combine].forEach((el2) => { if (el2) el2.disabled = !v; });
    };
    setEnabled(false); // no take yet at load — controls light up after STOP

    const stopPreview = () => {
      playing = false;
      const ic = surgeryUI.play.querySelector('ion-icon');
      if (ic) ic.setAttribute('name', 'play');
      prSources.forEach((s) => { try { s.stop(); } catch (e) {} });
      prSources = [];
    };

    const startPreview = () => {
      if (!takeBeatBuf || !takeMicBuf) return;
      stopPreview();
      if (!prCtx) prCtx = new AudioContext();
      if (prCtx.state === 'suspended') prCtx.resume();
      playing = true;
      const ic = surgeryUI.play.querySelector('ion-icon');
      if (ic) ic.setAttribute('name', 'pause');
      const ms = offset.value;
      const dur = takeBeatBuf.duration;
      const t = prCtx.currentTime + 0.05;
      const mk = (buf, when, off) => {
        const s = prCtx.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.loopStart = 0;
        s.loopEnd = dur;
        s.connect(prCtx.destination);
        if (off) s.start(when, off);
        else s.start(when);
        return s;
      };
      const beat = mk(takeBeatBuf, t);
      const mic = ms < 0 ? mk(takeMicBuf, t, -ms / 1000) : mk(takeMicBuf, t + ms / 1000);
      prSources = [beat, mic];
    };

    const applyOffset = (v) => {
      offset.value = clamp(v);
      surgeryUI.input.value = offset.value;
      surgeryUI.slider.value = offset.value;
      if (playing) startPreview(); // instantly re-cue with the new timing
    };

    surgeryUI.play.addEventListener('click', () => (playing ? stopPreview() : startPreview()));
    surgeryUI.slider.addEventListener('input', () => applyOffset(surgeryUI.slider.value));
    surgeryUI.input.addEventListener('change', () => applyOffset(surgeryUI.input.value));

    const decodeTake = async (beatBlob, micBlob) => {
      if (!prCtx) prCtx = new AudioContext();
      const beatBuf = await prCtx.decodeAudioData(await beatBlob.arrayBuffer());
      const micBuf = await prCtx.decodeAudioData(await micBlob.arrayBuffer());
      takeBeatBuf = beatBuf;
      takeMicBuf = micBuf;
    };

    recorder.onstop = async (beatBlob, micBlob) => {
      if (!beatBlob || !micBlob) {
        stopPreview();
        setEnabled(false);
        setStatus('Take empty — try again.');
        return;
      }
      stopPreview();
      applyOffset(0);
      setEnabled(true);
      setStatus('Decoding take…');
      try {
        await decodeTake(beatBlob, micBlob);
        setStatus('Take ready — nudge the offset, test it, then Combine.');
      } catch (e) {
        setEnabled(false);
        setStatus('Could not decode take (' + e.message + ') — re-record.');
      }
    };

    const audioBufferToWav = (buf) => {
      const ch = buf.numberOfChannels;
      const sr = buf.sampleRate;
      const len = buf.length;
      const bytes = 44 + len * ch * 2;
      const ab = new ArrayBuffer(bytes);
      const dv = new DataView(ab);
      const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      wstr(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); wstr(8, 'WAVE');
      wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
      dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
      dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
      wstr(36, 'data'); dv.setUint32(40, len * ch * 2, true);
      const chans = [];
      for (let i = 0; i < ch; i++) chans.push(buf.getChannelData(i));
      let off = 44;
      for (let i = 0; i < len; i++) {
        for (let c = 0; c < ch; c++) {
          const s = Math.max(-1, Math.min(1, chans[c][i]));
          dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          off += 2;
        }
      }
      return new Blob([ab], { type: 'audio/wav' });
    };

    surgeryUI.combine.addEventListener('click', async () => {
      if (!takeBeatBuf || !takeMicBuf) {
        setStatus('No decoded take yet — record and stop first.');
        return;
      }
      const ms = offset.value;
      const sr = prCtx ? prCtx.sampleRate : 44100;
      const dur = takeBeatBuf.duration;
      const offline = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
      const bsrc = offline.createBufferSource();
      bsrc.buffer = takeBeatBuf;
      bsrc.connect(offline.destination);
      bsrc.start(0);
      const msrc = offline.createBufferSource();
      msrc.buffer = takeMicBuf;
      msrc.connect(offline.destination);
      if (ms < 0) msrc.start(0, -ms / 1000);
      else msrc.start(ms / 1000);
      setStatus('Rendering…');
      try {
        const rendered = await offline.startRendering();
        const wav = audioBufferToWav(rendered);
        document.getElementById('recAudio').src = URL.createObjectURL(wav);
        setStatus('Combined at ' + ms + ' ms — output ready below.');
      } catch (e) {
        setStatus('Combine failed (' + e.message + ').');
      }
    });

    document.getElementById('btn-deleteRecord').onclick = () => {
      audio.chunks.length = 0;
      document.getElementById('recAudio').src = '';
      takeBeatBuf = null;
      takeMicBuf = null;
      stopPreview();
      setEnabled(false);
      applyOffset(0);
      setStatus('Press RECORD, play a beat, rap, STOP — this section fills with the take.');
    };
  }

  // Microphone toggle
  const micBtn = document.getElementById('micBtn');
  micBtn.addEventListener('click', () => {
    if (mic.state === 'started') {
      mic.close();
    } else {
      mic.open();
    }
  });

  // Live mic visualizer: draw the Tone FFT spectrum so the mic feeding Tone is
  // visible before relying on it for recording.
  const micCanvas = document.getElementById('micCanvas');
  if (micCanvas && micFFT) {
    const mctx = micCanvas.getContext('2d');
    const drawMic = () => {
      const w = (micCanvas.width = micCanvas.clientWidth || 300);
      const h = (micCanvas.height = micCanvas.clientHeight || 80);
      mctx.clearRect(0, 0, w, h);
      if (mic.state === 'started') {
        const freq = micFFT.getValue();
        const len = freq.length;
        const barW = 3;
        const gap = 1;
        const usable = Math.max(1, Math.floor(w / (barW + gap)));
        const stride = Math.max(1, Math.floor(len / usable));
        for (let i = 0; i < usable; i++) {
          const v = freq[i * stride] || -100;
          const norm = Math.pow(Math.max(0, Math.min(1, (v + 60) / 60)), 0.5);
          const bh = Math.max(2, norm * h);
          mctx.fillStyle = 'rgba(210,180,140,.9)';
          mctx.fillRect(i * (barW + gap), h - bh, barW, bh);
        }
      } else {
        mctx.fillStyle = 'rgba(255,255,255,.25)';
        mctx.font = '12px sans-serif';
        mctx.fillText('Mic off — tap Microphone', 8, h / 2 + 4);
      }
      requestAnimationFrame(drawMic);
    };
    drawMic();
  }

// Beat view
  beatToggles();
  setupPiano(sampler);
  // Auto-load a random pad at start, once the live pad list has arrived.
  dirsPromise.then(() => loadSample(getPad));

  // Autorap buttons
  autorap.wire();
  document.getElementById('btn-autorap').onclick = autorap1;
const autoBeatEl = document.getElementById('autoBeatAudio');
  autoBeatEl.muted = true;

  const playBeatTone = () => {
    if (!beatPlayer.loaded) return;
    beatPlayer.start(undefined, autoBeatEl.currentTime);
  };
  let tonePending = false;
  const loadBeat = () => {
    beatPlayer.stop();
    const { url } = getBeatShuffler();
    autoBeatEl.src = url;
    autoBeatEl.muted = true;
    beatPlayer.load(url).then(() => {
      if (tonePending) playBeatTone();
    }).catch(() => {
      autoBeatEl.muted = false;
    }).finally(() => {
      tonePending = false;
    });
  };

  document.getElementById('btn-autobeats').onclick = () => {
    unlock();
    loadBeat();
  };

  autoBeatEl.onplay = () => {
    unlock();
    tonePending = !beatPlayer.loaded;
    playBeatTone();
  };
  autoBeatEl.onpause = () => beatPlayer.stop();
  autoBeatEl.onended = loadBeat;

  // Auto Beats disclosure (plain HTML) — the header button toggles the content
  // panel; the chevron flip is driven by the data-open attribute.
  const accRoot = document.getElementById('autobeats-acc');
  const accBtn = document.getElementById('btn-autobeats-acc');
  const accBody = document.getElementById('autobeats-acc-body');
  if (accRoot && accBtn && accBody) {
    accBtn.onclick = () => {
      const open = accRoot.getAttribute('data-open') === 'true';
      accRoot.setAttribute('data-open', String(!open));
      accBtn.setAttribute('aria-expanded', String(!open));
      accBody.hidden = open;
    };
  }

  // Initial behavior parity
  roll();
}

// ---------- Raps & Beats community feed ----------
function feedStateEl(key) {
  return document.getElementById('feed-' + key + '-state');
}
function feedListEl(key) {
  return document.getElementById('feed-' + key + '-list');
}

function renderFeedError(key, message) {
  const state = feedStateEl(key);
  if (!state) return;
  state.classList.add('feed-error');
  state.innerHTML =
    '<ion-icon name="cloud-offline-outline" style="font-size:40px"></ion-icon>' +
    '<p>Couldn\u2019t load this feed right now.</p>' +
    '<p class="feed-hint">' + message + '</p>' +
    '<ion-button size="small" color="light" onclick="window.fkRetry(\'' + key + '\')">Try again</ion-button>';
}

// ---- Kicker player (Home, top band) ----
// Mirrors whichever feed track is playing: title/author from the tapped post,
// with a play/pause toggle that drives the shared #feedPlayer audio element
// (the bottom band stays the live reference while the design is being built).
let currentFeedTrack = null;
let activeFeedBtn = null;

function fkSet(track) {
  currentFeedTrack = track || null;
  const title = track ? track.title : 'Nothing playing';
  const artist = track ? track.author : 'Press play on a track';
  document.querySelectorAll('.fk-widget .fk-title').forEach((el) => {
    if (el.textContent !== title) el.textContent = title;
  });
  document.querySelectorAll('.fk-widget .fk-artist').forEach((el) => {
    if (el.textContent !== artist) el.textContent = artist;
  });
  updateFkGlobalVisibility();
}

function fkSetPlaying(playing) {
  const icon = document.querySelector('#fkToggle ion-icon');
  if (icon) icon.setAttribute('name', playing ? 'pause' : 'play');
  if (activeFeedBtn) {
    const bi = activeFeedBtn.querySelector('ion-icon');
    if (bi) bi.setAttribute('name', playing ? 'pause' : 'play');
    activeFeedBtn.title = playing ? 'Pause' : 'Play';
  }
}

function fmtTime(secs) {
  if (!isFinite(secs) || secs == null) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function wireSeek() {
  bindSeeker('fkSeek', 'fkCur', 'fkDur');
  bindSeeker('fkSeekBasic', 'fkCurBasic', 'fkDurBasic');
}

function bindSeeker(seekId, curId, durId) {
  const audio = document.getElementById('feedPlayer');
  const seek = document.getElementById(seekId);
  const cur = document.getElementById(curId);
  const dur = document.getElementById(durId);
  if (!audio || !seek) return;
  let dragging = false;
  const paint = (pct) => {
    const p = Math.max(0, Math.min(100, pct));
    seek.style.background = 'linear-gradient(90deg, #fff ' + p + '%, #4a4a4a ' + p + '%)';
  };
  const refresh = () => {
    const d = audio.duration;
    if (isFinite(d) && d > 0) {
      seek.max = d;
      if (dur) dur.textContent = fmtTime(d);
    }
    const t = audio.currentTime || 0;
    if (cur) cur.textContent = fmtTime(t);
    if (isFinite(d) && d > 0) {
      seek.value = t;
      paint((t / d) * 100);
    }
  };
  audio.addEventListener('loadedmetadata', refresh);
  audio.addEventListener('durationchange', refresh);
  audio.addEventListener('timeupdate', () => { if (!dragging) refresh(); });
  audio.addEventListener('ended', () => {
    seek.value = 0;
    paint(0);
    if (cur) cur.textContent = fmtTime(0);
  });
  seek.addEventListener('input', () => {
    dragging = true;
    const v = parseFloat(seek.value);
    if (cur) cur.textContent = fmtTime(v);
    paint(isFinite(audio.duration) && audio.duration > 0 ? (v / audio.duration) * 100 : 0);
  });
  seek.addEventListener('change', () => {
    dragging = false;
    audio.currentTime = parseFloat(seek.value);
    refresh();
  });
  refresh();
}

// Menu setting: advanced audio player animation (flip-to-seeker) vs the
// basic persistent seeker row. Unchecked by default and persisted locally.
const FK_ADVANCED_KEY = 'fkAdvancedPlayer';

// Anchors the global player just above the bottom tab bar and measures its
// height so tab content can clear it. Defensive about early measurement:
// if the tab bar has no layout yet we keep a safe default instead of ever
// collapsing the player below the bar (which hides it behind the bar).
function layoutFkWidget() {
  const widget = document.getElementById('fkWidget');
  const bar = document.querySelector('ion-tab-bar');
  if (!widget) return;
  let bottomPx = 50;
  if (bar) {
    const r = bar.getBoundingClientRect();
    if (r.height > 20 && r.top > 0) {
      bottomPx = window.innerHeight - r.top;
    } else if (r.height > 20) {
      bottomPx = r.height;
    }
  }
  widget.style.bottom = Math.max(bottomPx, 40) + 'px';
  document.documentElement.style.setProperty('--fk-widget-h', widget.classList.contains('fk-hidden') ? '0px' : (widget.getBoundingClientRect().height || 0) + 'px');
}

// The player is shown on the first (home) tab always; on the other tabs only
// once a track has been loaded. Call this whenever the tab or track changes.
let fkCurTab = 'home';

function updateFkGlobalVisibility() {
  const widget = document.getElementById('fkWidget');
  if (!widget) return;
  const hasTrack = !!(currentFeedTrack && currentFeedTrack.audioUrl);
  widget.classList.toggle('fk-hidden', !(fkCurTab === 'home' || hasTrack));
  layoutFkWidget();
}

function initFkLayout() {
  updateFkGlobalVisibility();
  window.addEventListener('resize', layoutFkWidget);
  window.addEventListener('load', layoutFkWidget);
  const tabs = document.querySelector('ion-tabs');
  if (tabs) {
    tabs.addEventListener('ionTabsDidChange', (e) => {
      const t = e && e.detail && e.detail.tab;
      if (t) {
        fkCurTab = t;
        updateFkGlobalVisibility();
      }
    });
    document.querySelectorAll('ion-tab-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('tab');
        if (t) fkCurTab = t;
      });
    });
    const bar = document.querySelector('ion-tab-bar');
    if (bar && 'ResizeObserver' in window) {
      new ResizeObserver(layoutFkWidget).observe(bar);
    }
  }
  // Late geometry settles (fonts, safe-area, Ionic hydration) re-anchor.
  setTimeout(layoutFkWidget, 800);
  setTimeout(layoutFkWidget, 2500);
}

function applyPlayerMode(advanced) {
  const widget = document.getElementById('fkWidget');
  const chk = document.getElementById('fk-chk-advanced');
  if (!widget) return;
  widget.dataset.mode = advanced ? 'advanced' : 'basic';
  if (!advanced) {
    const flip = document.getElementById('fkFlip');
    if (flip) flip.classList.remove('flipped');
  }
  if (chk) chk.checked = !!advanced;
  setTimeout(layoutFkWidget, 60);
}

function wirePlayerPref() {
  let enabled = false;
  try {
    enabled = localStorage.getItem(FK_ADVANCED_KEY) === '1';
  } catch (e) {}
  applyPlayerMode(enabled);
  const chk = document.getElementById('fk-chk-advanced');
  if (chk) {
    chk.addEventListener('ionChange', (e) => {
      const on = !!e.detail.checked;
      applyPlayerMode(on);
      try { localStorage.setItem(FK_ADVANCED_KEY, on ? '1' : '0'); } catch (err) {}
    });
  }
}

// Tapping the track info flips it vertically (0.5s) onto the seeker face.
// The seeker face auto-flips back after 4s with no seeking, or ~1.5s after
// the last seek interaction, whichever applies.
function wireInfoFlip() {
  const info = document.getElementById('fkInfo');
  const flip = document.getElementById('fkFlip');
  const seek = document.getElementById('fkSeek');
  if (!info || !flip) return;
  let timer = null;
  const hideSeeker = () => flip.classList.remove('flipped');
  const armReturn = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(hideSeeker, ms);
  };
  info.addEventListener('click', () => {
    const widget = document.getElementById('fkWidget');
    if (widget && widget.dataset.mode !== 'advanced') return;
    flip.classList.toggle('flipped');
    if (flip.classList.contains('flipped')) armReturn(4000);
  });
  if (seek) {
    const armAutoFlip = () => {
      if (!flip.classList.contains('flipped')) flip.classList.add('flipped');
      armReturn(1500);
    };
    seek.addEventListener('input', armAutoFlip);
    seek.addEventListener('change', armAutoFlip);
    seek.addEventListener('touchstart', armAutoFlip, { passive: true });
  }
}

// Open the left (hamburger) and right (user) menu buttons by directly opening
// the named <ion-menu> element. Ionic's ion-menu-toggle auto-hides in this
// tabs setup, so we drive the menus explicitly.
function wireMenuButtons() {
  document.querySelectorAll('button[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const menu = document.getElementById(btn.getAttribute('data-open'));
      if (menu && typeof menu.open === 'function') menu.open();
    });
  });
}

// Re-shows the native <audio controls> reference band on demand (surgical debugging).
window.__showNativeFeed = (show) => {
  const band = document.getElementById('fkLiveBand');
  if (band) band.classList.toggle('fk-hidden', !show);
};

// Repeat-one: tapping the repeat button arms it (highlighted); each time the
// track ends it replays from the top, looping the same song until disarmed.
function wireRepeatOnce() {
  const btn = document.getElementById('fkRepeat');
  const audio = document.getElementById('feedPlayer');
  if (!btn || !audio) return;
  let armed = false;
  const paint = () => btn.classList.toggle('active', armed);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    armed = !armed;
    paint();
  });
  audio.addEventListener('ended', () => {
    if (armed) {
      audio.currentTime = 0;
      audio.play();
    }
  });
}

function wirePlayerToggle() {
  const toggle = document.getElementById('fkToggle');
  const audio = document.getElementById('feedPlayer');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    if (isFeedPlaying()) {
      stopFeed();
    } else if (currentFeedTrack && currentFeedTrack.audioUrl) {
      playSong(currentFeedTrack.audioUrl);
    }
  });
  if (audio) {
    audio.addEventListener('play', () => fkSetPlaying(true));
    audio.addEventListener('pause', () => fkSetPlaying(false));
  }
}

function renderFeed(key, items) {
  const list = feedListEl(key);
  const state = feedStateEl(key);
  if (state) state.style.display = 'none';
  if (!list) return;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<p class="feed-state">Nothing posted yet.</p>';
    return;
  }
  items.forEach((post) => {
    const card = document.createElement('div');
    card.className = 'feed-card';

    // Play button — far left.
    const btn = document.createElement('ion-button');
    btn.className = 'feed-play';
    btn.setAttribute('fill', 'solid');
    btn.setAttribute('shape', 'round');
    const icon = () => btn.querySelector('ion-icon');
    const setIcon = (name) => {
      const el = icon();
      if (el) el.setAttribute('name', name);
    };
    if (!post.audioUrl) {
      btn.setAttribute('title', 'No audio available');
    } else {
      btn.setAttribute('title', 'Play');
    }
    btn.innerHTML = '<ion-icon name="play" slot="icon-only"></ion-icon>';
    btn.addEventListener('click', async () => {
      if (!post.audioUrl) return;
      if (isFeedPlaying()) {
        stopFeed();
        setIcon('play');
        btn.title = 'Play';
        return;
      }
      activeFeedBtn = btn;
      fkSet(post);
      const ok = await playSong(post.audioUrl);
      if (ok) {
        btn.title = 'Pause';
      } else {
        fkSetPlaying(false);
        btn.title = 'Could not play this track';
      }
    });
    card.appendChild(btn);

    // Circular art: uploaded image when available, else a CD-style placeholder.
    const art = document.createElement('div');
    art.className = 'feed-art';
    if (post.image) {
      const img = document.createElement('img');
      img.className = 'feed-art-img';
      img.src = post.image;
      img.alt = '';
      art.appendChild(img);
    } else {
      art.innerHTML = '<ion-icon name="musical-notes"></ion-icon>';
    }
    card.appendChild(art);

    // Title + author (flexes to fill the middle).
    const info = document.createElement('div');
    info.className = 'feed-info';
    const title = document.createElement('p');
    title.className = 'feed-title';
    if (post.link) {
      const a = document.createElement('a');
      a.href = post.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = post.title;
      title.appendChild(a);
    } else {
      title.textContent = post.title;
    }
    const author = document.createElement('p');
    author.className = 'feed-author';
    author.textContent = 'by ' + post.author;
    info.appendChild(title);
    info.appendChild(author);
    card.appendChild(info);

    // Like button (heart) — far right. Present for looks only; not wired yet.
    const like = document.createElement('button');
    like.type = 'button';
    like.className = 'feed-like';
    like.setAttribute('aria-label', 'Like');
    like.title = 'Like';
    like.innerHTML = '<ion-icon name="heart-outline"></ion-icon>';
    card.appendChild(like);

    list.appendChild(card);
  });
}

async function loadFeed(key) {
  const state = feedStateEl(key);
  if (state) {
    state.classList.remove('feed-error');
    state.style.display = '';
  }
  try {
    const items = await fetchFeed(key);
    renderFeed(key, items);
  } catch (err) {
    renderFeedError(key, err && err.message ? err.message : 'try again later');
  }
}

window.fkRetry = function (key) {
  loadFeed(key);
};

function wireFeeds() {
  loadFeed('raps');
  loadFeed('beats');

  // Two-tab Home feed organizer: Raps | Beats segment shows one feed at a time.
  const seg = document.getElementById('home-feed-seg');
  if (seg) {
    seg.addEventListener('ionChange', (ev) => {
      showFeedPane(ev.detail && ev.detail.value);
    });
  }
  showFeedPane('raps');
}

function showFeedPane(key) {
  ['raps', 'beats'].forEach((k) => {
    const pane = document.getElementById('feed-' + k);
    if (pane) pane.style.display = k === key ? '' : 'none';
  });
}

// ---------- Boot: mount Vue and wire UI once Ionic is ready ----------
export function boot() {
  let app = null;

  // Mount Vue ONLY on a small dedicated element so it never clobbers the
  // existing Ionic markup that the imperative wiring (wireUI) depends on.
  // Later this can be migrated to full .vue SFCs / Vue-owned templates.
  const holder = document.getElementById('vue-holder');
  if (Vue && holder) {
    app = Vue.createApp({
      data() {
        return {
          message: 'Freestyle King',
          version: 'Ionic + Vue'
        };
      }
    });
    app.mount('#vue-holder');
  }

// Wire interactions after Ionic web components have upgraded.
  let wired = false;
  const doWire = () => {
    if (wired) return;
    wired = true;
    try { wireUI(); } catch (e) {}
    try { wireFeeds(); } catch (e) {}
  };
  if (customElements && customElements.whenDefined) {
    customElements.whenDefined('ion-content').then(doWire).catch(doWire);
  } else {
    doWire();
  }
  setTimeout(doWire, 4000);

  return app;
}

export {
  roll, rollCommon, rollAdj, rollAdv, rollVerbs, rollCeleb, rollAth,
  rollMov, rollEmo, rollFla, rollQue,
  randomA, randomE, randomI, randomO, randomU, randomah, randomeh,
  randomih, randomuh, randomowh,
  other2
};
