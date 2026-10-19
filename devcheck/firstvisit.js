// a cold arrival, no referrer: the curtain must be there to see
await new Promise(r => setTimeout(r, 120));
const pre = document.getElementById('pre');
return { curtainPresentOnColdArrival: !!pre,
  halves: pre ? pre.querySelectorAll('.pre__half').length : 0,
  wordmark: pre ? (pre.querySelector('.pre__word') || {}).textContent : null,
  referrer: document.referrer || '(none)' };
