/**
 * Freestyle King — Raps & Beats feed.
 *
 * Pulls community posts from the WordPress REST API (posts in the "raps" and
 * "beats" categories) and renders them as cards, mirroring the original
 * homepage repeater (Play button + title + author).
 *
 * This is deliberately front-loaded with config so the whole feed can be
 * re-pointed at a different backend (e.g. the future .NET API) by swapping
 * FEED_CONFIG alone.
 */

// ---- Swap this config to re-point the feed at another backend ----
export const FEED_CONFIG = {
  // Base of the WordPress REST API (handles paths + trailing slash).
  base: 'https://freestylekingapp.com/wp-json/wp/v2',
  perPage: 15,
  categories: {
    raps: { slug: 'raps', label: 'Raps', accent: '#415f9d' },
    beats: { slug: 'beats', label: 'Beats', accent: '#cf0a2c' }
  }
};

let catIdCache = {};

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error('Feed request failed: ' + res.status);
  }
  return res.json();
}

function buildUrl(base, path, params) {
  const u = new URL(base.replace(/\/+$/, '') + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

async function resolveCategoryId(category) {
  if (catIdCache[category.slug]) return catIdCache[category.slug];
  const list = await getJson(
    buildUrl(FEED_CONFIG.base, '/categories', { slug: category.slug, per_page: 1 })
  );
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Category not found: ' + category.slug);
  }
  catIdCache[category.slug] = list[0].id;
  return catIdCache[category.slug];
}

async function resolveAudioUrl(post) {
  // 1) Prefer an explicit ACF audio URL if the field is exposed (string URL).
  const acf = post.acf || {};
  const field = acf.rap || acf.beat;
  if (typeof field === 'string' && /^https?:\/\//.test(field)) return field;

  // 2) The post's featured media may be the audio file.
  const media = post._embedded && post._embedded['wp:featuredmedia'];
  if (media && media[0] && media[0].source_url) {
    return media[0].source_url;
  }

  // 3) Practical source: audio attached to the post (wp/v2/media?parent=<id>).
  //    Each post is a real track; the audio lives as an attachment, not as
  //    featured media or an ACF field.
  try {
    const list = await getJson(
      buildUrl(FEED_CONFIG.base, '/media', { parent: post.id, per_page: 10 })
    );
    const audio = (Array.isArray(list) ? list : []).find(
      (a) => a.source_url && /^audio\//i.test(a.mime_type || '')
    );
    if (audio) return audio.source_url;
  } catch (err) {
    // Fall through; no attachable audio URL found.
  }

  return '';
}

function authorFor(post) {
  if (post._embedded && post._embedded.author && post._embedded.author[0]) {
    return post._embedded.author[0].name || 'unknown';
  }
  return 'unknown';
}

/**
 * Fetch posts for a category key ('raps' | 'beats').
 * Resolves the category slug -> id, then requests posts with embedded
 * author/media so every card has what it needs in one call.
 */
export async function fetchFeed(categoryKey) {
  const category = FEED_CONFIG.categories[categoryKey];
  if (!category) throw new Error('Unknown feed: ' + categoryKey);
  const id = await resolveCategoryId(category);
  const posts = await getJson(
    buildUrl(FEED_CONFIG.base, '/posts', {
      categories: id,
      per_page: FEED_CONFIG.perPage,
      _embed: true
    })
  );
  return Promise.all(
    (Array.isArray(posts) ? posts : []).map(async (post) => ({
      key: categoryKey,
      title: (post.title && post.title.rendered) || '(untitled)',
      author: authorFor(post),
      link: post.link || '',
      audioUrl: await resolveAudioUrl(post)
    }))
  );
}

// ---- Shared audio player ----------
// Routes every feed Play button through a single shared <audio controls>
// element (the "open audio tag" on Home), so native controls work, playback is
// plain-element (no CORS), and only one track plays at a time.
let feedPlayer = null;

function notifyFeedError(msg) {
  // Best-effort: log it so it's visible in devtools.
  console.error('Feed audio:', msg);
}

function getPlayer() {
  if (!feedPlayer) {
    feedPlayer = document.getElementById('feedPlayer');
    if (!feedPlayer) feedPlayer = new Audio();
    // NOTE: intentionally NOT routed through a Web Audio AudioContext.
    // A MediaElementSource reads the element's samples subject to CORS, so for
    // cross-origin media it would output silence even though the native
    // <audio controls> element plays fine. A plain element streams without CORS.
  }
  return feedPlayer;
}

/**
 * Plays a feed audio url through the shared plain <audio controls> player.
 * Returns a promise that resolves true if playback started, false otherwise.
 */
export function playSong(url) {
  if (!url) {
    notifyFeedError('no audio url');
    return Promise.resolve(false);
  }
  const audio = getPlayer();
  audio.pause();
  return new Promise((resolve) => {
    audio.addEventListener('error', () => {
      notifyFeedError('load error for ' + url);
      resolve(false);
    }, { once: true });
    audio.addEventListener('playing', () => {
      resolve(true);
    }, { once: true });
    audio.src = url;
    audio.load();
    audio.play().catch(() => {
      notifyFeedError('play() rejected for ' + url);
      resolve(false);
    });
  });
}

/** True while the shared feed player is playing. */
export function isFeedPlaying() {
  const audio = feedPlayer;
  return !!(audio && !audio.paused && !audio.ended);
}

/** Stops the shared feed player. */
export function stopFeed() {
  if (feedPlayer) {
    feedPlayer.pause();
  }
}
