// find text blocks that sit too close to their neighbour relative to their own line-height
const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight*0.7) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,260)); }
await new Promise(r => setTimeout(r, 800));
const els = [...document.querySelectorAll('h1,h2,h3,p,dt,dd,li,span.eb,figcaption,label')]
  .filter(e => e.offsetParent !== null && e.textContent.trim());
const boxes = els.map(e => ({ e, r: e.getBoundingClientRect(),
  lh: parseFloat(getComputedStyle(e).lineHeight) || 20,
  fs: parseFloat(getComputedStyle(e).fontSize) }));
boxes.sort((a,b) => (a.r.top + scrollY) - (b.r.top + scrollY));
const tight = [];
for (let i = 1; i < boxes.length; i++) {
  const prev = boxes[i-1], cur = boxes[i];
  if (cur.e.contains(prev.e) || prev.e.contains(cur.e)) continue;
  const gap = cur.r.top - prev.r.bottom;
  const need = Math.max(prev.lh, cur.lh) * 0.35;
  if (gap < need) tight.push({ gap: Math.round(gap), need: Math.round(need),
    a: prev.e.tagName.toLowerCase() + ':' + prev.e.textContent.trim().slice(0,22),
    b: cur.e.tagName.toLowerCase() + ':' + cur.e.textContent.trim().slice(0,22) });
}
return { page: location.pathname.replace('.html',''), tightPairs: tight.length, worst: tight.slice(0,6) };
