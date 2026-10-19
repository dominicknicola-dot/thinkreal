// watch the opening actually complete, and sample the curtain as it parts
const seen = [];
const t0 = performance.now();
const snap = () => {
  const pre = document.getElementById('pre');
  const t = document.getElementById('preT'), b = document.getElementById('preB');
  seen.push({ ms: Math.round(performance.now() - t0),
    pre: !!pre,
    top: t ? getComputedStyle(t).transform.slice(0, 28) : null,
    bot: b ? getComputedStyle(b).transform.slice(0, 28) : null });
};
for (let i = 0; i < 14; i++) { snap(); await new Promise(r => setTimeout(r, 260)); }
await new Promise(r => setTimeout(r, 1200));
const hero = document.querySelector('[data-hero]');
const copy = [...hero.querySelectorAll('.eb, .ln > span, .bd, .btn, .pick__opt')];
return {
  curtainGone: !document.getElementById('pre'),
  heroCopyVisible: copy.filter(e => +getComputedStyle(e).opacity > 0.9).length + '/' + copy.length,
  navVisible: +getComputedStyle(document.querySelector('.brand')).opacity > 0.9,
  stageVisible: +getComputedStyle(document.querySelector('.hero__stage')).opacity > 0.9,
  timeline: seen.filter((s, i) => i % 2 === 0).map(s => s.ms + 'ms pre=' + s.pre),
};
