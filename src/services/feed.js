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

function mediaUrlFor(post) {
  // ACF field may expose the audio attachment id/url under post.acf[field]
  const acf = post.acf || {};
  const field = acf.rap || acf.beat;
  if (typeof field === 'string' && /^https?:\/\//.test(field)) return field;
  if (typeof field === 'number' && post._embedded && post._embedded['wp:featuredmedia']) {
    const m = post._embedded['wp:featuredmedia'][0];
    if (m && m.source_url) return m.source_url;
  }
  // Fallback: use the featured image if it's actually an audio file
  if (post._embedded && post._embedded['wp:featuredmedia']) {
    const m = post._embedded['wp:featuredmedia'][0];
    if (m && m.source_url && /\.(mp3|wav|ogg|m4a|aac)$/i.test(m.source_url)) {
      return m.source_url;
    }
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
      _embed: 'author,wp:featuredmedia'
    })
  );
  return (Array.isArray(posts) ? posts : []).map((post) => ({
    key: categoryKey,
    title: (post.title && post.title.rendered) || '(untitled)',
    author: authorFor(post),
    link: post.link || '',
    audioUrl: mediaUrlFor(post)
  }));
}

// ---- Simple playback (mirrors the original playSong helper) ----
let currentFeedAudio = null;

/**
 * Plays a feed audio url, stopping any previous feed track.
 * Returns true if it intended to play.
 */
export function playSong(url) {
  if (!url) return false;
  if (currentFeedAudio) {
    currentFeedAudio.pause();
    currentFeedAudio = null;
  }
  const audio = new Audio(url);
  audio.play().catch(() => {});
  currentFeedAudio = audio;
  return true;
}
