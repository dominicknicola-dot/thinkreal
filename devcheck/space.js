const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight * 0.7) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 280)); }
await new Promise(r => setTimeout(r, 700));
const rows = [];
for (const sec of document.querySelectorAll('.scene, .pin, .hero')) {
  const r = sec.getBoundingClientRect();
  const kids = [...sec.querySelectorAll('h1,h2,h3,p,dt,dd,figure,img,a,dl')]
    .map(e => e.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0);
  if (!kids.length) continue;
  const top = Math.min(...kids.map(b => b.top)), bot = Math.max(...kids.map(b => b.bottom));
  rows.push({ id: sec.id || sec.getAttribute('aria-label') || sec.className.split(' ')[0],
    box: Math.round(r.height), ink: Math.round(bot - top),
    empty: Math.round((1 - (bot - top) / r.height) * 100) });
}
return { sections: rows.sort((a,b)=>b.empty-a.empty).slice(0,5),
  eyebrows: document.querySelectorAll('.eb').length,
  captions: document.querySelectorAll('figcaption').length,
  screens: +(H/innerHeight).toFixed(1) };
