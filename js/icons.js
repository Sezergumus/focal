// Observatory icon set: one inline SVG sprite, drawn in the lighthouse's own vocabulary
// (light rays, lanterns, tides, stars) instead of text glyphs. Every icon inherits `currentColor`.
//
//   ico('beam')           -> markup for JS templates
//   <svg class="ico"><use href="#i-beam"></use></svg>   -> the same thing in index.html

const ICONS = {
  // forward / next: a lamp sending out a ray (flip with .ico-flip for "back")
  beam: '<circle cx="4.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M9 12h11M15.5 7l5 5-5 5"/>',
  // start fresh: the tide turns around a pivot
  reset: '<path d="M21 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  // undo: a thread drawn back
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  // a quarter turn of a brass fitting
  rotate: '<path d="M5 15a7 7 0 0 1 7-7h6"/><path d="M14.5 4.5 18 8l-3.5 3.5"/>',
  // hint: the reading lantern
  lantern: '<path d="M8.5 7 12 4l3.5 3"/><rect x="7.5" y="7" width="9" height="11" rx="2"/><path d="M12 16.2c-1.9-1.2-1.7-3 0-4.9 1.7 1.9 1.9 3.7 0 4.9z" fill="currentColor" stroke="none"/><path d="M9 21h6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  // in tune
  star: '<path d="M12 2.5l2.1 7.4 7.4 2.1-7.4 2.1L12 21.5l-2.1-7.4L2.5 12l7.4-2.1z" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
  // listen: the music box
  note: '<path d="M9 17.5v-12l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  // the archive of old skies / a new sky
  moon: '<path d="M20 14.2A8.3 8.3 0 0 1 9.8 4a8.3 8.3 0 1 0 10.2 10.2z"/><path d="M17.5 3.5v3M16 5h3"/>',
  // the observer's guide
  compass: '<circle cx="12" cy="12" r="9"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z" fill="currentColor" fill-opacity=".28"/>',
  // share this note
  letter: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M4 8.5l8 5.5 8-5.5"/>',
  // a small ripple across the water: the gentle "not quite"
  ripple: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5" opacity=".5"/>',
  // resonance connectors
  same: '<path d="M6 9.5h12M6 14.5h12"/>',
  opposite: '<path d="M7 7l10 10M17 7 7 17"/>'
};

export function ico(name, cls = '') {
  return `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

// icon + label, for buttons and pills
export function withIcon(name, label, cls = '') {
  return `${ico(name, cls)}<span>${label}</span>`;
}

export function mountIconSprite() {
  if (typeof document === 'undefined' || document.getElementById('ico-sprite')) return;
  const symbols = Object.entries(ICONS)
    .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
    .join('');
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="ico-sprite" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${symbols}</svg>`;
  document.body.prepend(holder.firstChild);
}

// Games render from template strings, so the sprite has to exist before any of them draw.
mountIconSprite();
