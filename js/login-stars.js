'use strict';

// Decorative star field: bounded canvas resolution, one animation loop, no dependencies.
(() => {
  const host = document.querySelector('.login-brand');
  const canvas = host?.querySelector('.login-stars');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, active: false };
  let width = 0, height = 0, stars = [], frame = 0, previous = 0, time = 0;

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(110, Math.max(32, Math.round(width * height / 9500)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      phase: Math.random() * Math.PI * 2, depth: .3 + Math.random() * .7,
      radius: .55 + Math.random() * .85, dx: 0, dy: 0
    }));
    if (reduced.matches || document.hidden) draw(0);
  }

  function draw(delta) {
    ctx.clearRect(0, 0, width, height);
    const animate = !reduced.matches;
    const ease = 1 - Math.exp(-delta * 5);
    for (const star of stars) {
      const baseX = star.x + (animate ? Math.sin(time * .12 + star.phase) * 9 * star.depth : 0);
      const baseY = star.y + (animate ? Math.cos(time * .1 + star.phase) * 12 * star.depth : 0);
      let targetX = 0, targetY = 0, proximity = 0;
      if (animate && pointer.active) {
        const vx = baseX - pointer.x, vy = baseY - pointer.y;
        const distance = Math.hypot(vx, vy);
        proximity = Math.max(0, 1 - distance / 180);
        const push = proximity * proximity * 26 * star.depth;
        targetX = vx / Math.max(distance, 1) * push + (pointer.x / width - .5) * 12 * star.depth;
        targetY = vy / Math.max(distance, 1) * push + (pointer.y / height - .5) * 12 * star.depth;
      }
      star.dx = animate ? star.dx + (targetX - star.dx) * ease : 0;
      star.dy = animate ? star.dy + (targetY - star.dy) * ease : 0;
      const x = baseX + star.dx, y = baseY + star.dy;
      const alpha = .22 + star.depth * .28 + (animate ? Math.sin(time * .7 + star.phase) * .09 : 0) + proximity * .28;
      ctx.fillStyle = `rgba(235,241,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fill();
      if (proximity > .25) {
        ctx.fillStyle = `rgba(235,241,255,${proximity * .07})`;
        ctx.beginPath();
        ctx.arc(x, y, star.radius * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function tick(now) {
    const delta = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now;
    time += delta;
    draw(delta);
    frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    cancelAnimationFrame(frame);
    previous = 0;
    host.classList.toggle('motion-paused', document.hidden);
    if (reduced.matches || document.hidden) draw(0);
    else frame = requestAnimationFrame(tick);
  }
  host.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reduced.matches) return;
    const bounds = host.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
  }, { passive: true });
  host.addEventListener('pointerleave', () => { pointer.active = false; });
  document.addEventListener('visibilitychange', syncMotion);
  reduced.addEventListener('change', syncMotion);
  new ResizeObserver(resize).observe(host);
  resize();
  syncMotion();
})();
