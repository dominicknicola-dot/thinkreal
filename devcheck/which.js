await new Promise(r => setTimeout(r, 3200));
const H = document.documentElement.scrollHeight;
for (let y = 0; y < H; y += innerHeight * 0.6) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 420)); }
await new Promise(r => setTimeout(r, 1200));
const hid = [...document.querySelectorAll('[data-r]')].filter(e => +getComputedStyle(e).opacity < 0.9);
return { hidden: hid.length, which: hid.slice(0,6).map(e => e.dataset.r + ' "' + e.textContent.trim().slice(0,22) + '" in=' + e.classList.contains('in')) };
