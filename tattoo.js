// Tattoo-flash artwork behind the main panel: a radiant sun, a rose, a snake
// whose body is a waveform, two swallows and a "HALDEN 6" banner.
// Drawn here as SVG so every colour comes from the skin's tokens
// (--tat-line, --tat-fill, --tat-fill-2, --tat-opacity in styles.css).
// Coordinates use a 1600 x 720 canvas.

(function () {
  const W = 1600, H = 720, CX = 800, CY = 330;
  const rad = d => (d * Math.PI) / 180;
  const pt = (r, a, cx = CX, cy = CY) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const f = n => n.toFixed(1);
  const P = ([x, y]) => `${f(x)} ${f(y)}`;
  const out = [];

  // ---------- sun: alternating long and short rays, dotted ring ----------
  for (let i = 0; i < 36; i++) {
    const a = i * 10 - 90, len = i % 2 ? 228 : 282, w = i % 2 ? 2.6 : 2;
    out.push(`<path class="f" d="M${P(pt(176, a - w))} L${P(pt(len, a))} L${P(pt(176, a + w))} Z"/>`);
  }
  out.push(`<circle class="ln" cx="${CX}" cy="${CY}" r="168"/>`);
  out.push(`<circle class="dots" cx="${CX}" cy="${CY}" r="156"/>`);

  // ---------- snake: body follows a sine wave, hidden behind the sun disc ----------
  const x0 = 120, x1 = 1440;
  const yAt = x => CY + 120 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 3 + Math.PI);
  const N = 260, left = [], right = [], spine = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = x0 + (x1 - x0) * t, y = yAt(x);
    const dx = 1, dy = yAt(x + 0.5) - yAt(x - 0.5);
    const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    const w = 3 + 15 * Math.min(1, t / 0.4) ** 0.8; // tapers to a thin tail
    left.push([x + nx * w, y + ny * w]); right.push([x - nx * w, y - ny * w]);
    spine.push({ x, y, nx, ny, tx: dx / len, ty: dy / len, w });
  }
  const snake = [];
  snake.push(`<path class="f2" d="M${left.map(P).join(' L')} L${right.reverse().map(P).join(' L')} Z"/>`);
  // scales: chevrons pointing to the tail
  for (let i = 18; i < N - 6; i += 5) {
    const s = spine[i], k = s.w * 0.75, b = 7;
    snake.push(`<path class="ln thin" d="M${f(s.x + s.nx * k)} ${f(s.y + s.ny * k)} L${f(s.x - s.tx * b)} ${f(s.y - s.ty * b)} L${f(s.x - s.nx * k)} ${f(s.y - s.ny * k)}"/>`);
  }
  // head, eye and forked tongue at the right end
  const e = spine[N], hx = e.x, hy = e.y, tx = e.tx, ty = e.ty, nx = e.nx, ny = e.ny;
  const at = (a, b) => [hx + tx * a + nx * b, hy + ty * a + ny * b];
  snake.push(`<path class="f2" d="M${P(at(-6, 17))} C${P(at(20, 28))} ${P(at(48, 22))} ${P(at(64, 4))} L${P(at(64, -4))} C${P(at(48, -22))} ${P(at(20, -28))} ${P(at(-6, -17))} Z"/>`);
  snake.push(`<circle class="eye" cx="${f(at(34, 9)[0])}" cy="${f(at(34, 9)[1])}" r="4.5"/>`);
  snake.push(`<path class="ln" d="M${P(at(64, 0))} L${P(at(92, 0))} M${P(at(92, 0))} L${P(at(104, 8))} M${P(at(92, 0))} L${P(at(104, -8))}"/>`);
  out.push(`<mask id="h6-sun-cut"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="${CX}" cy="${CY}" r="172" fill="#000"/></mask>`);
  out.push(`<g mask="url(#h6-sun-cut)">${snake.join('')}</g>`);

  // ---------- rose ----------
  const petals = (n, rin, rout, rot, cls) => {
    const half = 180 / n + 6;
    for (let i = 0; i < n; i++) {
      const a = rot + (360 / n) * i;
      out.push(`<path class="${cls}" d="M${P(pt(rin, a - half))} C${P(pt(rout * 1.12, a - half * 0.9))} ${P(pt(rout * 1.12, a + half * 0.9))} ${P(pt(rin, a + half))} Z"/>`);
      out.push(`<path class="ln thin" d="M${P(pt(rin + (rout - rin) * 0.35, a - half * 0.55))} Q${P(pt(rout * 0.92, a))} ${P(pt(rin + (rout - rin) * 0.35, a + half * 0.55))}"/>`);
    }
  };
  // leaves first, so the rose sits on top of them
  [[145, 34], [35, -34]].forEach(([a, tilt]) => {
    const base = pt(92, a), tip = pt(205, a + tilt * 0.15);
    const mid = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2];
    const dx = tip[0] - base[0], dy = tip[1] - base[1], L = Math.hypot(dx, dy), ux = -dy / L, uy = dx / L;
    const side = s => [mid[0] + ux * 34 * s, mid[1] + uy * 34 * s];
    out.push(`<path class="f" d="M${P(base)} Q${P(side(1))} ${P(tip)} Q${P(side(-1))} ${P(base)} Z"/>`);
    out.push(`<path class="ln thin" d="M${P(base)} L${P(tip)}"/>`);
    for (let k = 1; k <= 3; k++) {
      const q = [base[0] + dx * k / 4, base[1] + dy * k / 4];
      [1, -1].forEach(s => out.push(`<path class="ln thin" d="M${P(q)} L${f(q[0] + dx * 0.12 + ux * 16 * s)} ${f(q[1] + dy * 0.12 + uy * 16 * s)}"/>`));
    }
  });
  out.push(`<circle class="bg" cx="${CX}" cy="${CY}" r="64"/>`);
  petals(7, 58, 122, -90, 'f2');
  petals(5, 30, 82, -54, 'f');
  // spiral bud
  const bud = [];
  for (let i = 0; i <= 120; i++) { const t = i / 120, r = 4 + 34 * t; bud.push(P(pt(r, -90 + t * 790))); }
  out.push(`<path class="ln" d="M${bud.join(' L')}"/>`);

  // ---------- swallows ----------
  const swallow = 'M66 -2 C46 -18 6 -16 -30 -6 L-92 -30 L-58 -2 L-94 22 L-30 8 C4 18 44 16 66 -2 Z';
  const wingUp = 'M18 -10 C6 -62 -40 -96 -88 -112 C-52 -78 -38 -46 -22 -8 Z';
  const wingDn = 'M20 8 C14 42 -8 64 -44 78 C-24 52 -16 30 -10 10 Z';
  const feathers = 'M-4 -20 L-46 -62 M-12 -14 L-62 -70 M2 -26 L-28 -66';
  const bird = (x, y, mirror) =>
    `<g transform="translate(${x} ${y}) scale(${mirror ? -1.05 : 1.05} 1.05) rotate(-8)">` +
    `<path class="f" d="${wingUp}"/><path class="ln thin" d="${feathers}"/><path class="f" d="${wingDn}"/>` +
    `<path class="f2" d="${swallow}"/><circle class="f2" cx="60" cy="-4" r="13"/>` +
    `<path class="dot-fill" d="M71 -8 L88 -3 L71 2 Z"/><circle class="eye" cx="64" cy="-7" r="3"/></g>`;
  out.push(bird(300, 150, false), bird(1300, 150, true));

  // ---------- banner with name ----------
  const bx0 = 540, bx1 = 1060, by = 548, sag = 26, bh = 54;
  out.push(`<path class="f" d="M${bx0 - 70} ${by + 18} L${bx0} ${by + 6} L${bx0} ${by + bh + 6} L${bx0 - 70} ${by + bh + 18} L${bx0 - 48} ${by + 18 + bh / 2} Z"/>`);
  out.push(`<path class="f" d="M${bx1 + 70} ${by + 18} L${bx1} ${by + 6} L${bx1} ${by + bh + 6} L${bx1 + 70} ${by + bh + 18} L${bx1 + 48} ${by + 18 + bh / 2} Z"/>`);
  out.push(`<path class="f2" d="M${bx0} ${by} Q${CX} ${by + sag * 2} ${bx1} ${by} L${bx1} ${by + bh} Q${CX} ${by + bh + sag * 2} ${bx0} ${by + bh} Z"/>`);
  out.push(`<path id="h6-banner-line" fill="none" stroke="none" d="M${bx0 + 10} ${by + bh * 0.72} Q${CX} ${by + bh * 0.72 + sag * 2} ${bx1 - 10} ${by + bh * 0.72}"/>`);
  out.push(`<text class="lettering"><textPath href="#h6-banner-line" startOffset="50%" text-anchor="middle">HALDEN 6</textPath></text>`);

  // ---------- sparkles ----------
  const star = (x, y, s) => `<path class="dot-fill" d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z"/>`;
  [[150, 470, 16], [230, 610, 10], [470, 90, 12], [640, 640, 9], [1130, 90, 12], [1370, 470, 16], [1290, 620, 10], [960, 650, 9], [80, 260, 9], [1520, 260, 9]]
    .forEach(([x, y, s]) => out.push(star(x, y, s)));

  const svg = `<svg class="tattoo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${out.join('')}</svg>`;

  window.Tattoo = {
    // Put the artwork behind everything else inside `container`
    mount(container) { container.insertAdjacentHTML('afterbegin', svg); },
  };
})();
