const f = document.getElementById('cform');
const box = document.getElementById('c-human');
const btn = document.getElementById('cformBtn');
const err = document.getElementById('c-human-err');
const out = { exists: !!box, type: box && box.type, required: box && box.required };
// submitting unchecked must be refused with a readable reason
btn.click();
await new Promise(r => setTimeout(r, 300));
out.blockedWhenUnchecked = !err.hidden && err.textContent.length > 10;
out.message = err.textContent;
out.ariaInvalid = box.getAttribute('aria-invalid');
// the drawn box must follow the native state
const drawn = box.nextElementSibling;
out.uncheckedTick = +getComputedStyle(drawn.querySelector('svg')).opacity;
box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
await new Promise(r => setTimeout(r, 250));
out.checkedTick = +getComputedStyle(drawn.querySelector('svg')).opacity;
out.errorClears = err.hidden;
const r = document.querySelector('.check').getBoundingClientRect();
out.tapHeight = Math.round(r.height);
out.labelDrivesBox = document.querySelector('label.check').getAttribute('for') === 'c-human';
return out;
