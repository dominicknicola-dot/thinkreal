const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight*0.7) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,240)); }
const sel = decodeURIComponent(location.hash.slice(1));
const el = document.querySelector(sel);
window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 70);
await new Promise(r => setTimeout(r, 900));
return 'at ' + sel;
