const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight * 0.7) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 320)); }
await new Promise(r => setTimeout(r, 1000));
const hid = [...document.querySelectorAll('[data-r]')].filter(e => +getComputedStyle(e).opacity < 0.9);
const wc = [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).willChange !== 'auto');
return {
  screens: +(H / innerHeight).toFixed(1),
  overflow: document.documentElement.scrollWidth > innerWidth,
  cls: +(performance.getEntriesByType('layout-shift')||[]).reduce((a,b)=>a+(b.hadRecentInput?0:b.value),0).toFixed(4),
  reveals: document.querySelectorAll('[data-r]').length,
  hidden: hid.length,
  willChange: wc.length,
  curtain: !!document.getElementById('pre'),
  captions: document.querySelectorAll('figcaption').length,
};
