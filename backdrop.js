// Backdrop behind the main panel: an octagon tile grid (octagons with small
// squares between them) under soft club lighting, with a few tiles glowing
// slowly in the skin's colours. Drawn as SVG sized to the panel in pixels,
// so tiles keep their shape at any window size. Colours and strength come
// from the --bd-* tokens in styles.css; tiles stop pulsing when the system
// asks for reduced motion.

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const S = 54;                              // tile size in px
  const C = S / (2 + Math.SQRT2);            // corner cut that makes a regular octagon
  const oct = (x, y) => [[C, 0], [S - C, 0], [S, C], [S, S - C], [S - C, S], [C, S], [0, S - C], [0, C]]
    .map(([a, b]) => `${(x + a).toFixed(1)},${(y + b).toFixed(1)}`).join(' ');

  // Same tiles light up after every resize: a fixed hash of the grid position
  const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };

  function draw(svg, w, h) {
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const cols = Math.ceil(w / S) + 1, rows = Math.ceil(h / S) + 1;
    let lit = '';
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const r = hash(i, j);
        if (r > 0.075) continue;
        const cls = r < 0.03 ? 'lit b' : 'lit a';
        const delay = (-hash(j, i) * 9).toFixed(2);
        lit += `<polygon class="${cls}" points="${oct(i * S, j * S)}" style="animation-delay:${delay}s"/>`;
      }
    }
    svg.innerHTML =
      `<defs>
        <pattern id="bd-oct" width="${S}" height="${S}" patternUnits="userSpaceOnUse">
          <polygon class="grid" points="${oct(0, 0)}"/>
        </pattern>
        <radialGradient id="bd-glow-a" cx="0.78" cy="0.12" r="0.65"><stop offset="0" class="glow-a"/><stop offset="1" class="glow-a end"/></radialGradient>
        <radialGradient id="bd-glow-b" cx="0.12" cy="1" r="0.6"><stop offset="0" class="glow-b"/><stop offset="1" class="glow-b end"/></radialGradient>
        <linearGradient id="bd-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/></linearGradient>
        <mask id="bd-mask"><rect width="${w}" height="${h}" fill="url(#bd-fade)"/></mask>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#bd-glow-a)"/>
      <rect width="${w}" height="${h}" fill="url(#bd-glow-b)"/>
      <g mask="url(#bd-mask)">
        <rect width="${w}" height="${h}" fill="url(#bd-oct)"/>
        ${lit}
      </g>`;
  }

  window.Backdrop = {
    // Put the backdrop behind everything else inside `container` and keep it sized
    mount(container) {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'backdrop');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      container.prepend(svg);
      let last = '';
      new ResizeObserver(() => {
        const w = Math.round(container.clientWidth), h = Math.round(container.clientHeight);
        if (!w || !h || `${w}x${h}` === last) return;
        last = `${w}x${h}`;
        draw(svg, w, h);
      }).observe(container);
    },
  };
})();
