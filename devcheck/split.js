const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight*0.7) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,280)); }
const fig = document.querySelector('.split .plate');
const sec = fig.closest('.scene');
window.scrollTo(0, window.scrollY + sec.getBoundingClientRect().top - 40);
await new Promise(r => setTimeout(r, 900));
const s = sec.getBoundingClientRect();
const txt = sec.querySelector('.split > div').getBoundingClientRect();
const img = fig.getBoundingClientRect();
return { sectionHeight: Math.round(s.height),
  textTop: Math.round(txt.top - s.top), textBottom: Math.round(txt.bottom - s.top),
  imgTop: Math.round(img.top - s.top), imgBottom: Math.round(img.bottom - s.top),
  textCentre: Math.round((txt.top + txt.bottom) / 2 - s.top),
  imgCentre: Math.round((img.top + img.bottom) / 2 - s.top),
  captions: sec.querySelectorAll('figcaption').length };
