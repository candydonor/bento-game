const paths = {
  speaker: '<path d="M3 9v6h4l5 4V5L7 9H3Z"/><path d="M16 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M3 9v6h4l5 4V5L7 9H3Z"/><path d="m16 10 5 5m0-5-5 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 1 1 4.6 2.1c-1.1.9-1.8 1.3-1.8 2.5"/><path d="M12 17h.01"/>',
  arrow: '<path d="M4.5 12h14m-5.5-5.5 5.5 5.5-5.5 5.5"/>',
  play: '<path d="m9 5 10 7-10 7V5Z" fill="currentColor" stroke-width="1.4"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 1 1 6 0v3m-3 4v1"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  tray: '<rect x="3" y="7" width="18" height="11" rx="3"/><path d="M9 7v11m6-11v11M6 4v.1M12 4v.1M18 4v.1"/>',
  sparkle: '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z" fill="currentColor" stroke="none"/>',
} as const;

export function icon(name: keyof typeof paths, cssClass = '') {
  return `<svg class="${cssClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
