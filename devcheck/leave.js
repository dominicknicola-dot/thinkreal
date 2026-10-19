await new Promise(r => setTimeout(r, 2600));              // opening done
const link = document.querySelector('.nav__links a[href$="cyprus.html"]');
const main = document.querySelector('main');
const before = +getComputedStyle(main).opacity;
link.click();
await new Promise(r => setTimeout(r, 90));                // return before the 170ms nav
return { linkFound: !!link,
  leavingClass: document.documentElement.classList.contains('leaving'),
  opacityBefore: before,
  opacityDuringExit: +getComputedStyle(main).opacity,
  transition: getComputedStyle(main).transitionDuration };
