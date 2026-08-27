const FORISMATIC_URL = 'https://api.forismatic.com/api/1.0/';
const DATAMUSE_URL = 'https://api.datamuse.com/words';

export function getSynonyms(word) {
  return fetch(`${DATAMUSE_URL}?ml=${encodeURIComponent(word)}`)
    .then((r) => r.json())
    .catch(() => []);
}

export function getSoundsLike(word) {
  return fetch(`${DATAMUSE_URL}?sl=${encodeURIComponent(word)}`)
    .then((r) => r.json())
    .catch(() => []);
}

export function getRhymes(word) {
  return fetch(`${DATAMUSE_URL}?rel_rhy=${encodeURIComponent(word)}`)
    .then((r) => r.json())
    .catch(() => []);
}

export function getForismaticQuote() {
  return new Promise((resolve, reject) => {
    const url = `${FORISMATIC_URL}?method=getQuote&lang=en&format=jsonp&jsonp=?`;
    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => reject(new Error('Forismatic API failed'));
    script.onload = () => script.remove();
    window.forismaticCallback = (response) => {
      window.forismaticCallback = null;
      resolve(response);
    };
    document.body.appendChild(script);
  });
}
