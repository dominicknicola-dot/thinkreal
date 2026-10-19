function lum(c){const [r,g,b]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*b;}
function ratio(a,b){const l1=lum(a),l2=lum(b);return +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))).toFixed(2);}
function bgOf(el){let n=el;while(n){const c=getComputedStyle(n).backgroundColor;if(c&&!/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/.test(c))return c;n=n.parentElement;}return 'rgb(255,255,255)';}
const H=document.documentElement.scrollHeight;
for(let y=0;y<H;y+=innerHeight*0.7){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,240));}
await new Promise(r=>setTimeout(r,600));
const out=[];
for(const sel of ['.fig__n','.fig__y','.fig__u','.fig__k','.fig__note','.bd','.hl','.dp']){
  const el=document.querySelector(sel); if(!el) continue;
  const cs=getComputedStyle(el);
  out.push({sel, size:cs.fontSize, ratio:ratio(cs.color,bgOf(el)),
    needs: parseFloat(cs.fontSize)>=24 || (parseFloat(cs.fontSize)>=18.66 && +cs.fontWeight>=700) ? 3 : 4.5});
}
return out.map(o=>`${o.sel.padEnd(11)} ${o.size.padStart(6)}  ${String(o.ratio).padStart(6)}:1  needs ${o.needs}  ${o.ratio>=o.needs?'PASS':'FAIL'}`);
