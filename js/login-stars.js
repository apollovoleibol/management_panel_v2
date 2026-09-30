'use strict';

// Three orbital layers share an anchor at the lower center of the viewport.
(() => {
  const host = document.querySelector('.login');
  const canvas = host?.querySelector('.login-stars');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, active: false };
  const layers = [
    { speed: .0018, size: .6, opacity: .25, pull: .45 },
    { speed: .0036, size: .9, opacity: .42, pull: .72 },
    { speed: .0068, size: 1.3, opacity: .65, pull: 1 }
  ];
  let width = 0, height = 0, stars = [], safeZones = [], frame = 0, previous = 0, elapsed = 0;
  let exitStart = 0;

  function startExit() {
    if (exitStart || reduced.matches) return;
    exitStart = performance.now();
    const centerX = width / 2, centerY = height / 2;
    const travel = Math.max(width, height) * 2;
    for (const star of stars) {
      const angle = star.angle + elapsed * star.layer.speed;
      const x = centerX + Math.cos(angle) * star.radius + star.offsetX;
      const y = height * 1.04 + Math.sin(angle) * star.radius + star.offsetY;
      const dx = x - centerX, dy = y - centerY;
      const length = Math.hypot(dx, dy) || 1;
      star.exit = {
        x, y,
        dx: (dx || Math.cos(star.phase)) / length * travel,
        dy: (dy || Math.sin(star.phase)) / length * travel
      };
    }
  }

  function updateSafeZones() {
    const root = host.getBoundingClientRect();
    safeZones = [
      ['.login-apollo', 12],
      ['.login-lockup', 26],
      ['.login-side', 20]
    ].map(([selector, padding]) => {
      const rect = host.querySelector(selector).getBoundingClientRect();
      return {
        left: rect.left - root.left - padding,
        top: rect.top - root.top - padding,
        right: rect.right - root.left + padding,
        bottom: rect.bottom - root.top + padding
      };
    });
  }

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const radius = Math.hypot(width / 2, height * 1.04) * 1.1;
    const count = Math.min(280, Math.max(150, Math.round(width * height / 4200)));
    if (!exitStart) stars = Array.from({ length: count }, (_, index) => ({
      angle: Math.random() * Math.PI * 2,
      radius: Math.sqrt(Math.random()) * radius,
      layer: layers[index % layers.length],
      phase: Math.random() * Math.PI * 2,
      offsetX: 0,
      offsetY: 0
    }));
    updateSafeZones();
    if (reduced.matches || document.hidden) draw(0);
  }

  function draw(delta) {
    ctx.clearRect(0, 0, width, height);
    const animate = !reduced.matches;
    const anchorX = width / 2, anchorY = height * 1.04;
    const progress = exitStart ? Math.min(1, (performance.now() - exitStart) / 900) : 0;
    const exitEase = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    for (const star of stars) {
      const { layer } = star;
      if (exitStart && star.exit) {
        const x = star.exit.x + star.exit.dx * exitEase;
        const y = star.exit.y + star.exit.dy * exitEase;
        if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
        ctx.fillStyle = `rgba(235,241,255,${layer.opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, layer.size, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const angle = star.angle + (animate ? elapsed * layer.speed : 0);
      const orbitX = anchorX + Math.cos(angle) * star.radius;
      const orbitY = anchorY + Math.sin(angle) * star.radius;
      let targetX = 0, targetY = 0;
      if (animate && pointer.active) {
        const distance = Math.hypot(pointer.x - orbitX, pointer.y - orbitY);
        const influence = Math.max(0, 1 - distance / 240);
        const attraction = Math.pow(influence, 1.3) * .98 * layer.pull;
        targetX = (pointer.x - orbitX) * attraction;
        targetY = (pointer.y - orbitY) * attraction;
      }
      const ease = 1 - Math.exp(-delta * (2.5 + layer.pull * 3));
      star.offsetX = animate ? star.offsetX + (targetX - star.offsetX) * ease : 0;
      star.offsetY = animate ? star.offsetY + (targetY - star.offsetY) * ease : 0;
      const x = orbitX + star.offsetX, y = orbitY + star.offsetY;
      if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
      const distanceToPointer = pointer.active && animate ? Math.hypot(pointer.x - x, pointer.y - y) : Infinity;
      const shrink = Math.min(1, Math.max(0, (distanceToPointer - 7) / 72));
      if (shrink <= 0) continue;
      let quiet = 1;
      for (const zone of safeZones) {
        const dx = Math.max(zone.left - x, 0, x - zone.right);
        const dy = Math.max(zone.top - y, 0, y - zone.bottom);
        quiet = Math.min(quiet, .08 + .92 * Math.min(1, Math.hypot(dx, dy) / 90));
      }
      const twinkle = animate ? .9 + Math.sin(elapsed * (.4 + layer.pull * .4) + star.phase) * .1 : 1;
      ctx.fillStyle = `rgba(235,241,255,${layer.opacity * twinkle * shrink * quiet})`;
      ctx.beginPath();
      ctx.arc(x, y, layer.size * shrink, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick(now) {
    const delta = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now;
    elapsed += delta;
    draw(delta);
    frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    cancelAnimationFrame(frame);
    previous = 0;
    host.querySelector('.login-brand').classList.toggle('motion-paused', document.hidden);
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
  window.addEventListener('huddle:access-granted', startExit);
  reduced.addEventListener('change', syncMotion);
  new ResizeObserver(resize).observe(host);
  const zoneObserver = new ResizeObserver(updateSafeZones);
  for (const selector of ['.login-apollo', '.login-lockup', '.login-side']) {
    zoneObserver.observe(host.querySelector(selector));
  }
  document.fonts?.ready.then(updateSafeZones);
  resize();
  syncMotion();
})();
