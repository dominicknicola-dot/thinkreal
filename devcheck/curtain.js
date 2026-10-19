const marks = [];
for (let i = 0; i < 10; i++) {
  marks.push(Math.round(performance.now()) + ':' + (document.getElementById('pre') ? 'up' : 'gone'));
  await new Promise(r => setTimeout(r, 400));
}
const copy = [...document.querySelectorAll('[data-hero] .ln > span, [data-hero] .bd, .hl .ln')];
return { marks, curtainGone: !document.getElementById('pre'),
  copyVisible: copy.filter(e => +getComputedStyle(e).opacity > 0.9).length + '/' + copy.length };
