const hid = [...document.querySelectorAll('input')].filter(e => +getComputedStyle(e).opacity < 0.9);
return hid.map(e => ({ id: e.id, name: e.name, type: e.type, cls: e.className,
  deliberate: e.closest('.check') ? 'styled checkbox, drawn box shows its state' : 'unexplained' }));
