(() => {
  "use strict";

  // Distances are measured from the resting pill's outline, in CSS pixels.
  const settings = { attachDistance: 150, releaseDistance: 245, maxPull: 34, spring: 230, damping: 19 };
  const button = document.querySelector(".venom-button");
  const anchor = document.querySelector(".button-anchor");
  const canvas = document.querySelector(".web");
  const context = canvas.getContext("2d");
  const hand = document.querySelector(".hand-cursor");
  const label = document.querySelector(".button-label");
  const stateLabel = document.querySelector(".state-label");
  const replay = document.querySelector(".replay");
  const status = document.querySelector("#activation-status");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = matchMedia("(pointer: coarse)");
  if (!context) return;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const pointer = { x: 0, y: 0, present: false, synthetic: false };
  const tip = { x: 0, y: 0 };
  const motion = { x: 0, y: 0, vx: 0, vy: 0 };
  let bounds, frame = 0, previousTime = 0, strength = 0, attached = false;
  let viewportWidth = 0, viewportHeight = 0, demoStart = null, press = 0;
  let activationTimer = 0, introTimer = 0;

  // Project onto a capsule rather than a bounding rectangle: roots stay on
  // the rounded ends as well as the straight top and bottom of the button.
  function surface(point, box) {
    const radius = box.height / 2;
    const spine = clamp(point.x, box.x - box.width / 2 + radius, box.x + box.width / 2 - radius);
    const dx = point.x - spine, dy = point.y - box.y;
    const distance = Math.hypot(dx, dy);
    const nx = distance > .001 ? dx / distance : 0;
    const ny = distance > .001 ? dy / distance : 1;
    return { x: spine + nx * radius, y: box.y + ny * radius, nx, ny, gap: distance - radius };
  }

  function measure() {
    const rect = anchor.getBoundingClientRect();
    bounds = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
    viewportWidth = innerWidth;
    viewportHeight = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewportWidth * ratio);
    canvas.height = Math.round(viewportHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    wake();
  }

  function setAttached(value) {
    if (value === attached) return;
    attached = value;
    document.body.classList.toggle("is-attached", value);
    stateLabel.textContent = value ? "attached" : "dormant";
    if (value && strength < .02) {
      const root = surface(pointer, bounds);
      tip.x = root.x;
      tip.y = root.y;
    }
  }

  function wake() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }

  function startDemo() {
    if (reducedMotion.matches) {
      activate();
      return;
    }
    clearTimeout(introTimer);
    demoStart = performance.now();
    pointer.synthetic = true;
    pointer.present = true;
    wake();
  }

  function updateDemo(time) {
    const t = (time - demoStart) / 1000;
    // An approach, a slow stretch, then a quick release. No autoplay loop.
    const approach = smooth(t / .8);
    const stretch = smooth((t - 1.15) / 1.6);
    const release = smooth((t - 2.8) / .5);
    const horizontalRoom = Math.max(20, viewportWidth / 2 - 48);
    pointer.x = bounds.x + Math.min(horizontalRoom, 105 + stretch * 50 + release * 45);
    pointer.y = bounds.y + bounds.height / 2 + mix(285, 65, approach) + stretch * 105 + release * 145;
    if (t > 3.5) {
      demoStart = null;
      pointer.present = false;
      pointer.synthetic = false;
    }
  }

  function curvePoint(a, b, c, d, t) {
    const u = 1 - t;
    return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x, y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y };
  }

  function strand(root, end, index, time, gap) {
    const dx = end.x - root.x, dy = end.y - root.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance, ny = dx / distance;
    const wave = Math.sin(time * .0018 + index * 2.4) * Math.min(gap * .06, 7);
    const bend = (index - 2) * 3.5 + wave;
    const b = { x: root.x + root.nx * distance * .27 + nx * bend, y: root.y + root.ny * distance * .27 + ny * bend };
    const c = { x: end.x - dx * .24 + nx * bend, y: end.y - dy * .24 + ny * bend + Math.min(gap * .08, 12) };
    const points = [], left = [], right = [];
    const thinning = mix(1, .55, clamp(gap / settings.releaseDistance, 0, 1));
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const p = curvePoint(root, b, c, end, t);
      const ahead = curvePoint(root, b, c, end, Math.min(1, t + .003));
      const behind = curvePoint(root, b, c, end, Math.max(0, t - .003));
      const tx = ahead.x - behind.x, ty = ahead.y - behind.y;
      const tangentLength = Math.hypot(tx, ty) || 1;
      const radius = ((6 + index % 3 * 1.7) * Math.pow(1 - t, 5) + 2.8 * Math.pow(t, 7) + (index % 2 ? .52 : 1.1)) * thinning;
      points.push(p);
      left.push({ x: p.x - ty / tangentLength * radius, y: p.y + tx / tangentLength * radius });
      right.push({ x: p.x + ty / tangentLength * radius, y: p.y - tx / tangentLength * radius });
    }
    context.beginPath();
    context.moveTo(left[0].x, left[0].y);
    left.slice(1).forEach(p => context.lineTo(p.x, p.y));
    right.reverse().forEach(p => context.lineTo(p.x, p.y));
    context.closePath();
    context.fillStyle = "#08090b";
    context.fill();
    context.beginPath();
    points.forEach((p, i) => i ? context.lineTo(p.x - .6, p.y - .6) : context.moveTo(p.x - .6, p.y - .6));
    context.strokeStyle = index % 2 ? "#64697360" : "#8c929b70";
    context.lineWidth = .65;
    context.stroke();
    return points;
  }

  function drawWeb(box, time) {
    const nearest = surface(tip, box);
    if (nearest.gap < 3 || strength < .008) return;
    const gap = nearest.gap;
    const dx = tip.x - nearest.x, dy = tip.y - nearest.y;
    const length = Math.hypot(dx, dy) || 1;
    const tangent = { x: -dy / length, y: dx / length };
    const spread = Math.min(24, box.width * .065) * smooth(gap / 38);
    const bias = ((box.x - nearest.x) * tangent.x + (box.y - nearest.y) * tangent.y) * .48;
    context.save();
    context.globalAlpha = strength * smooth(gap / 18);
    const strands = [];
    for (let i = 0; i < 5; i++) {
      const offset = [-2, -.9, -.15, 1.05, 2.3][i] * spread + bias;
      const root = surface({ x: tip.x + tangent.x * offset, y: tip.y + tangent.y * offset }, box);
      root.x -= root.nx * 3;
      root.y -= root.ny * 3;
      const end = { x: tip.x + tangent.x * (i - 2) * 1.2, y: tip.y + tangent.y * (i - 2) * 1.2 };
      strands.push(strand(root, end, i, time, gap));
    }
    // Small irregular cross threads give the stretched material its webbing.
    context.strokeStyle = "#1011149c";
    context.lineWidth = .7;
    for (let i = 0; i < strands.length - 1; i++) {
      for (let j = 0; j < 2; j++) {
        const a = strands[i][9 + i % 2 * 3 + j * 7];
        const b = strands[i + 1][12 + i % 3 + j * 6];
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 4, b.x, b.y);
        context.stroke();
      }
    }
    const gloss = context.createRadialGradient(tip.x - 2, tip.y - 3, 0, tip.x, tip.y, 7);
    gloss.addColorStop(0, "#777b82");
    gloss.addColorStop(.3, "#25282d");
    gloss.addColorStop(1, "#050607");
    context.fillStyle = gloss;
    context.beginPath();
    context.ellipse(tip.x, tip.y, 6, 8, Math.atan2(dy, dx) - Math.PI / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function render(time) {
    frame = 0;
    const dt = previousTime ? clamp((time - previousTime) / 1000, .001, .032) : 1 / 60;
    previousTime = time;
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    if (demoStart !== null) updateDemo(time);

    const canAnimate = !reducedMotion.matches;
    const gap = surface(pointer, bounds).gap;
    setAttached(canAnimate && pointer.present && gap < (attached ? settings.releaseDistance : settings.attachDistance));
    strength = mix(strength, attached ? 1 : 0, 1 - Math.exp(-dt * (attached ? 12 : 15)));

    let targetX = 0, targetY = 0;
    if (attached) {
      const dx = pointer.x - bounds.x, dy = pointer.y - bounds.y;
      const distance = Math.hypot(dx, dy) || 1;
      const pull = Math.min(settings.maxPull, distance * .15);
      targetX = dx / distance * pull;
      targetY = dy / distance * pull;
    }
    motion.vx += ((targetX - motion.x) * settings.spring - motion.vx * settings.damping) * dt;
    motion.vy += ((targetY - motion.y) * settings.spring - motion.vy * settings.damping) * dt;
    motion.x += motion.vx * dt;
    motion.y += motion.vy * dt;
    press *= Math.exp(-dt * 11);
    if (!canAnimate) { motion.x = motion.y = motion.vx = motion.vy = strength = press = 0; }
    const scale = 1 - press * .055;
    button.style.transform = "translate3d(" + motion.x.toFixed(3) + "px," + motion.y.toFixed(3) + "px,0) scale(" + scale.toFixed(4) + ")";
    button.style.setProperty("--light-x", clamp(50 + motion.x * 1.2, 20, 80) + "%");

    const box = { x: bounds.x + motion.x, y: bounds.y + motion.y, width: bounds.width * scale, height: bounds.height * scale };
    const destination = attached ? pointer : surface(tip, box);
    const follow = 1 - Math.exp(-dt * (attached ? 25 : 19));
    tip.x = mix(tip.x, destination.x, follow);
    tip.y = mix(tip.y, destination.y, follow);
    if (canAnimate) drawWeb(box, time);

    const showHand = canAnimate && pointer.present && (attached || strength > .08);
    document.body.classList.toggle("has-venom-cursor", showHand && !pointer.synthetic);
    hand.style.opacity = showHand ? Math.min(1, strength * 3).toFixed(3) : "0";
    // The SVG index fingertip aligns with the real pointer, preserving accuracy.
    hand.style.transform = "translate3d(" + (pointer.x - 17.4) + "px," + (pointer.y - 1.7) + "px,0) rotate(" + clamp(motion.x * .2, -7, 7) + "deg)";

    const moving = Math.abs(motion.x) + Math.abs(motion.y) + Math.abs(motion.vx) + Math.abs(motion.vy) > .025;
    if (attached || strength > .008 || moving || press > .002 || demoStart !== null) wake();
    else {
      previousTime = 0;
      motion.x = motion.y = motion.vx = motion.vy = strength = 0;
      button.style.transform = "";
      context.clearRect(0, 0, viewportWidth, viewportHeight);
    }
  }

  function activate() {
    clearTimeout(activationTimer);
    label.textContent = "we’re connected";
    status.textContent = "Connection made. Sticky button activated.";
    press = 1;
    wake();
    button.dispatchEvent(new CustomEvent("venom:activate", { bubbles: true }));
    activationTimer = setTimeout(() => { label.textContent = "let’s collaborate"; status.textContent = ""; }, 1600);
  }

  function release() {
    pointer.present = false;
    pointer.synthetic = false;
    demoStart = null;
    clearTimeout(introTimer);
    wake();
  }

  window.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    clearTimeout(introTimer);
    demoStart = null;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.present = true;
    pointer.synthetic = false;
    wake();
  }, { passive: true });
  window.addEventListener("pointerdown", event => {
    clearTimeout(introTimer);
    if (event.pointerType === "touch") release();
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", release);
  window.addEventListener("blur", release);
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("scroll", measure, { passive: true });
  button.addEventListener("click", activate);
  replay.addEventListener("click", startDemo);
  reducedMotion.addEventListener("change", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      pointer.present = false;
      demoStart = null;
      clearTimeout(introTimer);
      document.body.classList.remove("has-venom-cursor");
      hand.style.opacity = "0";
    } else wake();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Tab" || event.key === "Escape") release();
  });
  if (coarsePointer.matches) document.querySelector(".hint-description").textContent = "Tap to connect. Replay to watch it come alive.";
  new ResizeObserver(measure).observe(anchor);
  measure();
  if (!reducedMotion.matches) introTimer = setTimeout(startDemo, 750);
})();
