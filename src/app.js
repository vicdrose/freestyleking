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

    // Seed the first word immediately, then auto-advance every interval.
    this.advance();
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
  const { player, sampler, recorder, mic, beatGain, beatPlayer, beatEl, samplerGain } = audio;

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

  // Sliders (Ionic ion-range emits ionChange)
  const slider = document.getElementById('myRange');
  const output = document.getElementById('demo');
  output.innerHTML = slider.value || 100;
  slider.addEventListener('ionChange', () => {
    output.innerHTML = slider.value;
    player.playbackRate = slider.value / 100;
  });

const volslider = document.getElementById('volRange');
  const volume = document.getElementById('vol');
  volume.innerHTML = volslider.value || 100;
  volslider.addEventListener('ionChange', () => {
    volume.innerHTML = volslider.value;
    player.volume = -(volslider.value / 100);
  });

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
    samplerVolOut.innerHTML = samplerVol.value || 100;
    samplerGain.gain.value = (samplerVol.value || 100) / 100;
    samplerVol.addEventListener('ionChange', () => {
      samplerVolOut.innerHTML = samplerVol.value;
      samplerGain.gain.value = (samplerVol.value || 100) / 100;
    });
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

// Player start/stop.
  const btnStart = document.getElementById('btn-playerStart');
  const btnStop = document.getElementById('btn-playerStop');
  const urlEl = document.getElementById('url');
  let queuedUrl = null;

  // Browsers leave the AudioContext suspended until a user gesture unlocks it.
  const unlock = () => Tone.start().catch(() => {});

  const setState = (state) => { document.body.dataset.playerState = state; };

  // Load a loop into the player and mirror its status onto the URL line.
  const loadPlayer = (url, label) => {
    queuedUrl = url;
    if (urlEl) urlEl.innerHTML = (label || url) + ' - loading';
    player.stop();
    setState('loading');
    return unlock()
      .then(() => player.load(url))
      .then(() => {
        document.body.dataset.bufferLoaded = '1';
        setState('loaded');
        if (urlEl) urlEl.innerHTML = (label || url) + ' - ready';
        return true;
      })
      .catch(() => {
        setState('loadfailed');
        if (urlEl) urlEl.innerHTML = (label || url) + ' - could not load';
        return false;
      });
  };

  btnStart.onclick = async () => {
    await unlock();
    if (queuedUrl && !(player.buffer && player.buffer.loaded)) {
      const ok = await loadPlayer(queuedUrl, urlEl ? urlEl.textContent : queuedUrl);
      if (!ok) return;
    }
    if (!(player.buffer && player.buffer.loaded)) return;
    player.start();
    setState('started');
    if (urlEl) urlEl.innerHTML = (urlEl.innerHTML || '').replace(' - ready', ' - looping');
  };
  btnStop.onclick = () => {
    player.stop();
    setState('stopped');
  };

  // Custom URL.
  document.getElementById('btn-sendUrl').onclick = () => {
    const u = (document.querySelector('#audioUrl').value || '').trim();
    if (u) loadPlayer(u, u);
  };

  // Sample buttons unlock audio with the tap so the keys are audible (no test tones).
  const loadSample = (get) => {
    unlock();
    const { rel, url } = get();
    sampler.add('C4', url);
    document.querySelector('#url2').innerHTML = rel;
  };
  document.getElementById('btn-rollSample').onclick = () => loadSample(getPad);
  document.getElementById('btn-rollBass').onclick = () => loadSample(getBass);
  document.getElementById('btn-rollSFX').onclick = () => loadSample(getSFX);
  document.getElementById('btn-rollFills').onclick = () => loadSample(getFill);

  // Loop buttons load straight into the player; Start then plays it.
  document.getElementById('btn-rollBreak').onclick = () => {
    const { rel, url } = getBreak();
    loadPlayer(url, 'DRUM LOOP: ' + rel);
  };
  document.getElementById('btn-rollBeats').onclick = () => {
    const { rel, url } = getBeat();
    loadPlayer(url, 'CLASSICS: ' + rel);
  };
  document.getElementById('btn-rollFKBeats').onclick = () => {
    const { rel, url } = getFKBeat();
    loadPlayer(url, 'FK BEATS: ' + rel);
  };

  // Recording
  document.getElementById('btn-record').onclick = () => { unlock(); recorder.start(); };
  document.getElementById('btn-stopRecord').onclick = () => recorder.stop();
  document.getElementById('btn-deleteRecord').onclick = () => {
    audio.chunks.length = 0;
    document.getElementById('recAudio').src = '';
  };

  // Microphone toggle
  const micBtn = document.getElementById('micBtn');
  micBtn.addEventListener('click', () => {
    if (mic.state === 'started') {
      mic.close();
    } else {
      mic.open();
    }
  });

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
      setIcon('pause');
      const ok = await playSong(post.audioUrl);
      if (ok) {
        btn.title = 'Pause';
      } else {
        setIcon('play');
        btn.title = 'Could not play this track';
      }
    });
    card.appendChild(btn);
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
