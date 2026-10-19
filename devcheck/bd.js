function lum(c){const [r,g,b]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*b;}
function ratio(a,b){const l1=lum(a),l2=lum(b);return +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))).toFixed(2);}
function bgOf(el){let n=el;while(n){const c=getComputedStyle(n).backgroundColor;if(c&&!/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/.test(c))return c;n=n.parentElement;}return 'rgb(255,255,255)';}
const H=document.documentElement.scrollHeight;
for(let y=0;y<H;y+=innerHeight*0.7){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,240));}
const out=[];
for(const el of document.querySelectorAll('.bd, .fig__note, .jump .bd')){
  if (el.closest('[data-hero], [data-plate]')) continue;   // over a photograph, not a flat ground
  const cs=getComputedStyle(el);
  out.push({ text: el.textContent.trim().slice(0,30), size: cs.fontSize,
    theme: el.closest('[data-theme]') ? el.closest('[data-theme]').dataset.theme : '?',
    ratio: ratio(cs.color, bgOf(el)) });
}
return out.map(o=>`${o.theme.padEnd(5)} ${o.size.padStart(6)} ${String(o.ratio).padStart(6)}:1 ${o.ratio>=4.5?'PASS':'FAIL'}  ${o.text}`);
