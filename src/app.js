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
import { getBeatShuffler, getPad, getBreak, getBeat, getFKBeat, getBass, getSFX, getFill } from './services/samples.js';
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

// ---------- Word relationship API (Datamuse) ----------
const modal1 = document.getElementById('relationshipModal');
const modal2 = document.getElementById('slModal');
const modal3 = document.getElementById('synModal');

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
      const rq = document.getElementById('rap-quote');
      const ra = document.getElementById('rap-author');
      if (rq) rq.textContent = text;
      if (ra) ra.textContent = byline;
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

// ---------- Autorap ----------
function autorap1() {
  modal3.style.display = 'block';
  modal1.style.display = 'block';
  setInterval(roll, 8000);
}

function autorapverbs() {
  modal3.style.display = 'block';
  modal1.style.display = 'block';
  setInterval(rollVerbs, 8000);
}

function autorapadv() {
  modal3.style.display = 'block';
  modal1.style.display = 'block';
  setInterval(rollAdv, 8000);
}

function autorapadj() {
  modal3.style.display = 'block';
  modal1.style.display = 'block';
  setInterval(rollAdj, 8000);
}

// ---------- Wire up all UI (called from Vue mounted) ----------
function wireUI() {
  const audio = initAudio();
  const { player, sampler, recorder, mic } = audio;

  // Word buttons
  document.getElementById('btn-roll').onclick = roll;
  document.getElementById('btn-rollCommon').onclick = rollCommon;
  document.getElementById('btn-rollAdj').onclick = rollAdj;
  document.getElementById('btn-rollAdv').onclick = rollAdv;
  document.getElementById('btn-rollVerbs').onclick = rollVerbs;
  document.getElementById('btn-rollCeleb').onclick = rollCeleb;
  document.getElementById('btn-rollAth').onclick = rollAth;
  document.getElementById('btn-rollMov').onclick = rollMov;
  document.getElementById('btn-rollEmo').onclick = rollEmo;
  document.getElementById('btn-rollFla').onclick = rollFla;
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

  // Modals
  setupModal(modal1, 'close1', 'relationshipBtn');
  setupModal(modal2, 'close2', 'slBtn');
  setupModal(modal3, 'close3', 'synBtn');
  setupModal(document.getElementById('quotal'), 'close4', 'quptalbtn');

  // Quote
  document.getElementById('quoteBtn').onclick = (e) => { e.preventDefault(); getNewQuote(); };
  document.getElementById('shareQuote').onclick = (e) => {
    e.preventDefault();
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent('"' + quote + '"' + '- ' + author));
  };
  const rqb = document.getElementById('rap-quoteBtn');
  if (rqb) rqb.onclick = (e) => { e.preventDefault(); getNewQuote(); };
  const rsb = document.getElementById('rap-shareQuote');
  if (rsb) rsb.onclick = (e) => {
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

  // Player start/stop
  document.getElementById('btn-playerStart').onclick = () => player.start();
  document.getElementById('btn-playerStop').onclick = () => player.stop();

  // Custom URL
  document.getElementById('btn-sendUrl').onclick = () => {
    player.load(document.querySelector('#audioUrl').value);
  };

  // Sample buttons
  document.getElementById('btn-rollSample').onclick = () => {
    const { rel, url } = getPad();
    sampler.add('C4', url, false);
    document.querySelector('#url2').innerHTML = rel;
  };
  document.getElementById('btn-rollBass').onclick = () => {
    const { rel, url } = getBass();
    sampler.add('C4', url, false);
    document.querySelector('#url2').innerHTML = rel;
  };
  document.getElementById('btn-rollSFX').onclick = () => {
    const { rel, url } = getSFX();
    sampler.add('C4', url, false);
    document.querySelector('#url2').innerHTML = rel;
  };
  document.getElementById('btn-rollFills').onclick = () => {
    const { rel, url } = getFill();
    sampler.add('C4', url, false);
    document.querySelector('#url2').innerHTML = rel;
  };

  document.getElementById('btn-rollBreak').onclick = () => {
    const { rel, url } = getBreak();
    player.load(url);
    document.querySelector('#url').innerHTML = rel;
  };
  document.getElementById('btn-rollBeats').onclick = () => {
    const { rel, url } = getBeat();
    player.load(url);
    document.querySelector('#url').innerHTML = rel;
  };
  document.getElementById('btn-rollFKBeats').onclick = () => {
    const { rel, url } = getFKBeat();
    player.load(url);
    document.querySelector('#url').innerHTML = rel;
  };

  // Recording
  document.getElementById('btn-record').onclick = () => recorder.start();
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

  // Autorap buttons
  document.getElementById('btn-autorap').onclick = autorap1;
  document.getElementById('btn-autobeats').onclick = () => {
    const { url } = getBeatShuffler();
    const el = document.getElementById('beatShuffler');
    el.src = url;
  };

  // Autobeats on ended
  document.getElementById('beatShuffler').onended = () => {
    const { url } = getBeatShuffler();
    const el = document.getElementById('beatShuffler');
    el.src = url;
  };

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
  if (customElements && customElements.whenDefined) {
    customElements.whenDefined('ion-content').then(() => {
      wireUI();
      wireFeeds();
    }).catch(() => {
      wireUI();
      wireFeeds();
    });
  } else {
    wireUI();
    wireFeeds();
  }

  return app;
}

export {
  roll, rollCommon, rollAdj, rollAdv, rollVerbs, rollCeleb, rollAth,
  rollMov, rollEmo, rollFla, rollQue,
  randomA, randomE, randomI, randomO, randomU, randomah, randomeh,
  randomih, randomuh, randomowh,
  other2
};
