const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight * 0.7) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 300)); }
await new Promise(r => setTimeout(r, 900));
const all = [...document.querySelectorAll('[data-r], h1, h2, .bd, .ln > span, figure img, dt, dd, label, input, button')];
const hid = all.filter(e => { const c = getComputedStyle(e); const r = e.getBoundingClientRect();
  return +c.opacity < 0.9 || c.visibility === 'hidden' || (r.width === 0 && r.height === 0 && e.type !== 'hidden' && e.type !== 'checkbox'); });
return { total: all.length, hidden: hid.length,
  sample: hid.slice(0,4).map(e => e.tagName.toLowerCase() + '.' + String(e.className).slice(0,18)),
  curtain: !!document.getElementById('pre') };
