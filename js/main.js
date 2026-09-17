/* ============================================================
   THINK REAL
   Motion (motion.dev) runs the opening and every entrance.
   Scroll-linked parallax stays on one rAF loop below: it reads
   scrollY once per frame and writes transform/opacity, and the
   pin is CSS position:sticky. Geometry is measured on load, on
   resize, and never inside the loop.

   Every Motion animation is started AFTER the resting class is
   applied, so the CSS resting state is already correct: Motion
   overrides it while it plays and hands back to it at the end.
   If Motion never loads, the classes alone stage the same
   arrival, one fade deep.
   ============================================================ */
(function () {
  "use strict";
  var doc = document, html = document.documentElement;
  html.classList.remove("no-js");
  html.classList.add("js");

  var M = window.Motion || null;
  var ENTER = [0.16, 1, 0.3, 1];   /* things arriving */
  var MOVE = [0.65, 0, 0.35, 1];   /* things changing */

  /* ------------------------------------------------------------------
     One source of truth for the numbers. The stylesheet owns them; this
     reads them back. Before this, main.js carried its own copies, which
     meant the phone's re-timing block re-timed the CSS and nothing else:
     Motion still rose 28px on a 20px phone. Re-read whenever the mode
     changes, because that block is a media query.
     ------------------------------------------------------------------ */
  var tok = {};
  function readTokens() {
    var cs = window.getComputedStyle(html);
    function num(name, fallback) {
      var raw = cs.getPropertyValue(name).trim();
      var v = parseFloat(raw);
      if (!isFinite(v)) return fallback;
      return /ms$/.test(raw) ? v : /s$/.test(raw) ? v * 1000 : v;
    }
    tok.rise = num("--rise", 28);                 /* px      */
    tok.stagger = num("--stagger", 100) / 1000;   /* seconds */
    tok.enter = num("--d-enter", 800) / 1000;
    tok.exit = num("--d-exit", 480) / 1000;
    /* Travel is not one duration: it scales with the distance covered, so
       these are multiples of the entrance and the multiple is the distance. */
    tok.dNav = tok.exit * 1.3;    /* 10px, the nav dropping in    */
    tok.dCopy = tok.enter * 0.9;  /* one --rise                   */
    tok.dLine = tok.enter * 1.2;  /* a whole line, out of its clip */
  }
  readTokens();

  /* everything the opening is playing, so one gesture can end all of it */
  var running = [];
  function run(a) { if (a) running.push(a); return a; }
  /* Motion can leave the final keyframe on the element as an inline style.
     The resting state is already in the stylesheet, so once an entrance is
     over its inline styles are cleared: an inline opacity would otherwise
     outrank rules that come later, like html.moved .cue. */
  function settle(a, els) {
    function clear() {
      els.forEach(function (el) { el.style.opacity = ""; el.style.transform = ""; });
    }
    if (a && a.then) a.then(clear, clear); else window.setTimeout(clear, 2600);
  }
  /* Motion replaces the top-level transition with a per-property block when
     one is given, so a top-level delay or stagger() is silently dropped.
     Measured: a 0 / 300 / 600ms stagger landed at 37 / 37 / 37. Every
     staggered entrance on the site was arriving as one block. The delay has
     to live inside each block, as a number, so staggered groups are animated
     one element at a time and gathered back into one handle here. */
  function together(list) {
    return {
      then: function (ok, bad) { return Promise.all(list).then(ok, bad); },
      complete: function () { list.forEach(function (a) { try { a.complete(); } catch (e) {} }); }
    };
  }
  function finishAll() {
    for (var i = 0; i < running.length; i++) { try { running[i].complete(); } catch (e) {} }
    running = [];
  }
  function all(scope, sel) { return [].slice.call((scope || doc).querySelectorAll(sel)); }

  var mReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mFine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var mWide = window.matchMedia("(min-width: 768px)");
  function motion() { return !mReduce.matches; }
  /* the pin and every scroll-linked scene are desktop-only by design:
     mobile jank is worse than mobile plainness */
  function rich() { return motion() && mWide.matches; }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ============================================================
     SPA router (the artifact build only: [data-route] present)
     ============================================================ */
  var isSPA = !!doc.querySelector("[data-route]");
  var MARKETS = { cyprus: 1, greece: 1, middleeast: 1 };

  function toTop() {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (doc.body) doc.body.scrollTop = 0;
    html.scrollTop = 0;
  }
  try { if (!isSPA) history.scrollRestoration = "manual"; } catch (e) {}

  function routeFromHash() {
    var h = (location.hash || "").replace(/^#\/?/, "").split(/[#?]/)[0];
    return h || "home";
  }
  function showRoute(name) {
    var routes = doc.querySelectorAll("[data-route]"), found = false, shown = null;
    routes.forEach(function (r) {
      var on = r.dataset.route === name;
      r.hidden = !on;
      if (on) { found = true; shown = r; }
    });
    if (!found) { showRoute("home"); return; }
    doc.querySelectorAll(".nav__links a").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (MARKETS[name] && href.indexOf(name) !== -1) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    toTop();
    start(shown);
  }
  if (isSPA) window.addEventListener("hashchange", function () { showRoute(routeFromHash()); });

  /* ============================================================
     Contact form: Formspree, with a mailto escape hatch
     ============================================================ */
  var form = doc.getElementById("cform");
  if (form) {
    var msg = doc.getElementById("cformMsg");
    var alertBox = doc.getElementById("cformAlert");
    var submitBtn = doc.getElementById("cformBtn");
    var btnLabel = form.querySelector(".cform__btnlabel");
    var btnIdle = btnLabel ? btnLabel.textContent : "Send message";
    var endpoint = form.getAttribute("action") || "";
    var liveForm = /formspree\.io\/f\/[a-zA-Z0-9]+$/.test(endpoint) && endpoint.indexOf("REPLACE") === -1;
    var sending = false;
    var FIELDS = ["email", "name", "phone", "message"];

    function setFieldError(input, text) {
      var el = doc.getElementById(input.id + "-err");
      if (!el) return;
      if (text) {
        el.textContent = text; el.hidden = false;
        input.setAttribute("aria-invalid", "true"); input.classList.add("is-invalid");
      } else {
        el.textContent = ""; el.hidden = true;
        input.removeAttribute("aria-invalid"); input.classList.remove("is-invalid");
      }
    }
    function clearAllErrors() {
      FIELDS.forEach(function (n) { if (form[n]) setFieldError(form[n], ""); });
      if (alertBox) { alertBox.hidden = true; alertBox.textContent = ""; }
    }
    /* everything typed, as a mailto they can send in one click: a written
       enquiry is never lost to a blocked preview or an offline laptop */
    function mailtoHref() {
      var lines = [
        "Name: " + (form.name ? form.name.value.trim() : ""),
        "Email: " + (form.email ? form.email.value.trim() : "")
      ];
      var ph = form.phone ? form.phone.value.trim() : "";
      if (ph) lines.push("Phone: " + ph);
      var m = form.message ? form.message.value.trim() : "";
      if (m) lines.push("", m);
      return "mailto:info@think.cy?subject=" +
        encodeURIComponent("Consultation enquiry, " + (form.name ? form.name.value.trim() : "")) +
        "&body=" + encodeURIComponent(lines.join("\n"));
    }
    /* cause plus recovery, never just "invalid" */
    function validate(input) {
      var v = (input.value || "").trim();
      if (input.name === "email") {
        if (!v) return "Enter your email so we can reply.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "That email address looks incomplete. Check for a typo, for example name@company.com.";
      }
      if (input.name === "name" && !v) return "Enter your name so we know who we are speaking with.";
      if (input.name === "phone" && v && !/^[0-9\s()+-]{6,}$/.test(v)) return "Use digits, spaces and a leading +, for example +357 99 344 457.";
      return "";
    }
    FIELDS.forEach(function (n) {
      var input = form[n];
      if (!input) return;
      input.addEventListener("blur", function () { setFieldError(input, validate(input)); });
      input.addEventListener("input", function () {
        if (input.classList.contains("is-invalid") && !validate(input)) setFieldError(input, "");
      });
    });
    function setSending(on) {
      sending = on;
      if (!submitBtn) return;
      submitBtn.disabled = on;
      submitBtn.setAttribute("aria-busy", String(on));
      if (btnLabel) btnLabel.textContent = on ? "Sending…" : btnIdle;
    }
    function showSent(ok, detail) {
      if (ok === false) {
        if (alertBox) {
          alertBox.textContent = "";
          var p = doc.createElement("span");
          p.textContent = detail || "That did not send. Please try again, or send it as an email instead.";
          alertBox.appendChild(p);
          var a = doc.createElement("a");
          a.className = "cform__alertlink";
          a.href = mailtoHref();
          a.textContent = "Send this as an email instead";
          alertBox.appendChild(a);
          alertBox.hidden = false;
        }
        setSending(false);
        return;
      }
      form.classList.add("sent");
      msg.classList.add("show");
      msg.setAttribute("role", "status");
      msg.setAttribute("tabindex", "-1");
      msg.focus({ preventScroll: true });
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      clearAllErrors();
      var firstBad = null;
      FIELDS.forEach(function (n) {
        var input = form[n];
        if (!input) return;
        var err = validate(input);
        if (err) { setFieldError(input, err); if (!firstBad) firstBad = input; }
      });
      if (firstBad) { firstBad.focus(); return; }
      if (!liveForm) {
        showSent(true);
        try { window.open(mailtoHref(), "_blank"); } catch (err) {}
        return;
      }
      setSending(true);
      fetch(endpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, data: data }; });
        })
        .then(function (res) {
          if (res.ok) { showSent(true); return; }
          var errs = (res.data && (res.data.errors || res.data.error)) || null, placed = false;
          if (Array.isArray(errs)) {
            errs.forEach(function (er) {
              var f = er && (er.field || (er.properties && er.properties.field));
              var m = (er && (er.message || er.code)) || "";
              if (f && form[f]) { setFieldError(form[f], m.charAt(0).toUpperCase() + m.slice(1)); placed = true; }
            });
            if (placed) {
              setSending(false);
              var bad = form.querySelector('[aria-invalid="true"]');
              if (bad) bad.focus();
              return;
            }
          }
          showSent(false, typeof errs === "string" ? errs : null);
        })
        .catch(function () {
          showSent(false, isSPA
            ? "This preview blocks outside requests, so the form cannot submit from here. It will work on the live site."
            : "We could not reach the server. Check your connection and try again.");
        });
    });
  }

  /* ============================================================
     THE REVEAL
     Layers arrive in DOM order: eyebrow, headline lines, body, media,
     CTA. Elements that enter together are indexed together, so the
     order is perceived and a long page never queues delays.
     will-change goes on when it starts and comes off when it settles.
     ============================================================ */
  /* things that enter together are shown together, in reading order, and the
     batch carries the stagger. Motion springs the rise and eases the fade
     separately, so nothing ever overshoots its own opacity. */
  function reveal(el, delay) {
    /* the CSS fallback waits exactly as long as Motion does: --d is counted in
       staggers, and the .in rule multiplies it back out */
    el.style.setProperty("--d", delay / tok.stagger);
    el.classList.add("in");
    /* a media plate is a curtain wipe and a settle, both written in CSS */
    if (el.getAttribute("data-r") === "md" || !M || !motion()) return;
    el.classList.add("anim");
    /* the fade lands before the travel does, so the line is readable while
       it is still settling. The rise is a spring: it has no duration token
       because a spring is described by its physics, not by a length. The
       from-values are explicit, so the start never depends on how far the
       CSS fallback has got. */
    var a = M.animate(el, { opacity: [0, 1], y: [tok.rise, 0] }, {
      opacity: { duration: tok.exit, ease: ENTER, delay: delay },
      y: { type: "spring", stiffness: 130, damping: 22, mass: 0.9, delay: delay }
    });
    settle(a, [el]);
    if (a && a.then) a.then(function () { el.classList.remove("anim"); });
    else window.setTimeout(function () { el.classList.remove("anim"); }, delay * 1000 + 1600);
  }

  /* An element without data-r belongs to a scene. The creed and the pin both
     take their lines over by removing it, but they run after the reveal has
     already started watching those lines, so the reveal animated them anyway:
     measured on the creed, a clause the scroll had not reached yet rose to full
     opacity and then fell back to nothing as the scene reclaimed it. Ownership
     is read at the moment of revealing, not when the watching began, so a
     change of mode across 768px is honoured too. */
  function owned(el) { return !el.hasAttribute("data-r"); }

  /* The creed is three statements, not three items. On a desktop the scroll
     speaks it, one clause per third of the section. A phone has no scrub, so
     there it is spoken at its own pace: once the first clause arrives, each
     next one waits a fade, landing before the one after begins. Measured
     before this, a flick onto it brought all three to half opacity on the
     same frame, and a steady scroll let them trickle in wherever each line
     happened to cross the fold. Entrances only; nothing is tied to scroll. */
  function speak(creed, start) {
    [].slice.call(creed.querySelectorAll(".ln")).forEach(function (ln, i) {
      if (owned(ln) || ln.classList.contains("in")) return;
      reveal(ln, start + i * tok.exit);
    });
  }

  function showBatch(batch) {
    batch = batch.filter(function (el) { return !owned(el) && !el.classList.contains("in"); });
    batch.sort(function (a, b) { return (a.compareDocumentPosition(b) & 4) ? -1 : 1; });
    /* A batch never waits longer than six staggers for its last element, so a
       fast scroll does not queue. That used to be a cap on the slot, which
       stacked everything past the sixth onto the same frame: "The work" enters
       ten at a time, and its last four landed together at 600ms. The budget is
       the same; the step shrinks to fit it, so every element keeps its turn. */
    var step = Math.min(tok.stagger, (6 * tok.stagger) / Math.max(1, batch.length - 1));
    var slot = 0;
    batch.forEach(function (el) {
      /* already spoken, as part of its creed */
      if (el.classList.contains("in")) return;
      var creed = el.closest(".creed"), at = slot * step;
      if (creed) speak(creed, at); else reveal(el, at);
      slot++;
    });
  }

  function initReveals(scope) {
    var items = [].slice.call((scope || doc).querySelectorAll("[data-r]")).filter(function (el) {
      return !el.classList.contains("in");
    });
    if (!items.length) return;
    if (!motion()) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    /* A fast scroll can carry an element past the observer between two of its
       samples, and it would then sit hidden forever. Once scrolling settles,
       anything already inside the fold is shown whether it was seen or not. */
    var pending = items.slice(), sweepT = null;
    function sweep() {
      var edge = window.innerHeight * 0.88, late = [];
      pending = pending.filter(function (el) {
        if (el.classList.contains("in") || owned(el)) return false;
        if (el.getBoundingClientRect().top > edge) return true;
        late.push(el);
        return false;
      });
      if (late.length) showBatch(late);
    }
    window.addEventListener("scroll", function () {
      if (!pending.length) return;
      window.clearTimeout(sweepT);
      sweepT = window.setTimeout(sweep, 180);
    }, { passive: true });

    /* Motion's inView where it exists, the plain observer where it does not */
    if (M && M.inView) {
      var group = [], flush = null;
      M.inView(items, function (el) {
        if (el.classList.contains("in") || owned(el)) return;
        group.push(el);
        window.clearTimeout(flush);
        flush = window.setTimeout(function () {
          var batch = group; group = [];
          showBatch(batch);
        }, 40);
      }, { margin: "0px 0px -12% 0px" });
      return;
    }
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      var hit = entries.filter(function (e) { return e.isIntersecting; });
      if (!hit.length) return;
      hit.forEach(function (e) { io.unobserve(e.target); });
      showBatch(hit.map(function (e) { return e.target; }));
    }, { rootMargin: "0px 0px -12% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ============================================================
     THE OPENING
     The ground is not one panel but six bands. They clear left to
     right, top band first, so the photograph beneath is uncovered
     on a diagonal. Then the copy arrives in its own layers: the
     headline lines rise out of fixed clips, the markets follow,
     the button, then the small print at the edges. Any gesture
     ends the whole sequence at once.
     ============================================================ */

  /* the copy, in the order it is seen rather than the order it is written.
     `at` is seconds from the first copy layer. */
  function copyLayers(hero) {
    var L = [];
    function add(sel, at, gap, mask) {
      /* .cue is display:none below 1024, and animating something nobody can
         see costs a phone real frames for nothing */
      var els = [].slice.call(hero.querySelectorAll(sel)).filter(function (el) {
        return el.getClientRects().length > 0;
      });
      if (els.length) L.push({ els: els, at: at, gap: gap, mask: !!mask });
    }
    add(".ln > span", 0, tok.stagger * 1.1, true);
    add(".bd", 0.30, tok.stagger * 0.8);
    add(".pick__lead, .pick__opt", 0.34, tok.stagger * 0.7);
    add(".btn", 0.50, tok.stagger * 0.6);
    add(".eb, .cue", 0.58, tok.stagger * 0.8);
    return L;
  }

  function openCopy(hero, base) {
    if (!hero || hero.classList.contains("in-copy")) return;
    hero.classList.add("in-copy");
    if (!M || !motion()) return;
    copyLayers(hero).forEach(function (l) {
      var start = base + l.at;
      settle(together(l.els.map(function (el, i) {
        var delay = start + i * l.gap;
        /* the stylesheet's fallback fade waits for the same moment, or it
           would show the line at rest before Motion drops it into its clip */
        el.style.setProperty("--d", delay / tok.stagger);
        return run(M.animate(el,
          l.mask ? { opacity: [0, 1], y: ["112%", "0%"] } : { opacity: [0, 1], y: [tok.rise, 0] },
          {
            opacity: { duration: l.mask ? tok.exit * 0.67 : tok.exit * 1.25, ease: ENTER, delay: delay },
            y: { duration: l.mask ? tok.dLine : tok.dCopy, ease: ENTER, delay: delay }
          }));
      })), l.els);
    });
  }

  function openStage(hero) {
    if (!hero || hero.classList.contains("in")) return;
    hero.classList.add("in");
    if (!M || !motion()) return;
    var stage = hero.querySelector(".hero__stage");
    if (!stage) return;
    /* the photograph is already growing by the time the first band clears,
       so the bands uncover motion rather than a still */
    settle(run(M.animate(stage, { opacity: [0, 1], scale: [1.08, 1] }, {
      opacity: { duration: T.stageFade, ease: ENTER },
      scale: { duration: T.stageGrow, ease: ENTER }
    })), [stage]);
  }

  function openNav(start) {
    if (html.classList.contains("lifted")) return;
    html.classList.add("lifted");
    if (!M || !motion()) return;
    var els = all(doc, ".brand, .nav__links a, .nav__cta");
    if (!els.length) return;
    settle(run(M.animate(els, { opacity: 1, y: [-10, 0] }, {
      duration: tok.dNav, ease: ENTER,
      delay: M.stagger(0.065, { startDelay: start })
    })), els);
  }

  /* ============================================================
     NAV: theme and glass follow whichever section owns the top strip
     ============================================================ */
  var navEl = doc.getElementById("nav");
  var stripIO = null;
  function wireNav() {
    if (!navEl) return;
    if (stripIO) stripIO.disconnect();
    /* The owner is the section behind the bar's own midline, which is where
       its text sits. This used to be a 72px strip, and every section crossing
       it was a candidate: the first in document order won, so at every theme
       boundary the bar kept the upper section's styling until that section
       had left the strip entirely. Measured on a real clock, that was half a
       bar late at every boundary, on every page. A one-pixel line has one
       owner at a time. The bar's height is measured, not assumed: it is 76px
       on a desktop and 104px on a phone, where the 72px strip did not even
       cover it. */
    var mid = Math.round(navEl.getBoundingClientRect().height / 2);
    var below = Math.max(0, window.innerHeight - mid - 1);
    stripIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.__strip = e.isIntersecting; });
      var all = doc.querySelectorAll("[data-theme]"), chosen = null;
      for (var i = 0; i < all.length; i++) { if (all[i].__strip) { chosen = all[i]; break; } }
      if (!chosen) return;
      navEl.setAttribute("data-theme", chosen.getAttribute("data-theme") || "light");
      navEl.classList.toggle("solid", !chosen.hasAttribute("data-hero"));
    }, { rootMargin: "-" + mid + "px 0px -" + below + "px 0px" });
    /* the curtain is fixed, dark and covers the strip, so it would always win
       the vote and leave the bar glassed over a hero it never sat on */
    doc.querySelectorAll("[data-theme]").forEach(function (s) {
      if (s !== navEl && s.id !== "pre") stripIO.observe(s);
    });
  }

  /* ============================================================
     THE SCROLL ENGINE
     One scheduled frame per scroll burst. scrollY is the only thing
     read inside it; every offset was measured beforehand.
     ============================================================ */
  var scenes = [], queued = false, vh = window.innerHeight, liveIO = null;

  function schedule() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  function frame() {
    queued = false;
    var y = window.pageYOffset;
    for (var i = 0; i < scenes.length; i++) if (scenes[i].live) scenes[i].update(y);
  }
  window.addEventListener("scroll", schedule, { passive: true });
  /* a tab that comes back from the background, or from the back button, gets
     a frame at once rather than waiting for the visitor to scroll */
  doc.addEventListener("visibilitychange", schedule);
  window.addEventListener("pageshow", schedule);

  function addScene(el, scene) {
    /* live until the observer says otherwise: a scene must never be left
       holding its hidden state because a frame never arrived */
    scene.el = el; scene.live = true; scene.top = 0; scene.h = 0;
    el.__scene = scene;
    scenes.push(scene);
    if (liveIO) liveIO.observe(el);
  }
  function measureAll() {
    vh = window.innerHeight;
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i], r = s.el.getBoundingClientRect();
      s.top = r.top + window.pageYOffset;
      s.h = r.height;
    }
    /* apply immediately: the reads are done, and waiting for a frame would
       leave a scroll-linked scene blank on a tab that is not rendering yet */
    frame();
  }

  /* the hero hands over: its copy lifts and clears as the next scene
     starts arriving, and the plate drifts 5% of its 110% overscan */
  function heroScene(hero) {
    var copy = hero.querySelector(".hero__in"), stage = hero.querySelector(".hero__stage");
    if (!copy && !stage) return;
    addScene(hero, {
      update: function (y) {
        var t = clamp(y / (vh * 0.85));
        if (copy) {
          copy.style.opacity = (1 - t).toFixed(3);
          copy.style.translate = "0 " + (-t * 40).toFixed(1) + "px";
        }
        if (stage) stage.style.translate = "0 " + (t * 5).toFixed(2) + "%";
      }
    });
  }

  /* inset plates travel 7% of their own overscan as they cross the frame */
  function plateScene(fig) {
    var img = fig.querySelector(".frame img");
    if (!img) return;
    addScene(fig, {
      update: function (y) {
        var t = clamp((y + vh - this.top) / (vh + this.h));
        img.style.translate = "0 " + (t * 7 - 3.5).toFixed(2) + "%";
      }
    });
  }

  /* the creed is spoken at the pace of the scroll: one clause per third */
  function creedScene(sec) {
    var lines = [].slice.call(sec.querySelectorAll(".ln"));
    if (!lines.length) return;
    sec.setAttribute("data-live", "");
    lines.forEach(function (el) { el.removeAttribute("data-r"); });
    addScene(sec, {
      n: -1,
      update: function (y) {
        var a = this.top - vh * 0.82, b = this.top + this.h - vh * 0.42;
        var p = clamp((y - a) / Math.max(1, b - a));
        var n = p < 0.3 ? 1 : p < 0.62 ? 2 : 3;
        if (n === this.n) return;
        this.n = n;
        for (var i = 0; i < lines.length; i++) lines[i].classList.toggle("on", i < n);
      }
    });
  }

  /* ---------- the one pinned passage ---------- */
  var STOPS = [0.20, 0.46, 0.73];
  function pinScene(sec) {
    var frameEl = sec.querySelector(".pin__frame");
    var plates = [].slice.call(sec.querySelectorAll(".pin__plate"));
    var states = [].slice.call(sec.querySelectorAll(".pin__state"));
    var count = sec.querySelector(".pin__count");
    if (!frameEl || states.length < 2) return;

    sec.setAttribute("data-pin", "");
    /* inside the pin, the states own their own motion */
    states.forEach(function (s) {
      s.querySelectorAll("[data-r]").forEach(function (el) { el.removeAttribute("data-r"); });
    });

    var scene = {
      i: -1,
      set: function (i) {
        if (i === this.i) return;
        this.i = i;
        states.forEach(function (s, n) { s.classList.toggle("on", n === i); });
        /* the market being left holds underneath, as in the hero */
        plates.forEach(function (p, n) {
          var next = n === i - 1;
          if (!next && p.classList.contains("on")) p.classList.add("was");
          p.classList.toggle("on", next);
        });
        window.clearTimeout(this.wasTimer);
        this.wasTimer = window.setTimeout(function () {
          plates.forEach(function (p) { p.classList.remove("was"); });
        }, 760);
        if (count) count.textContent = i ? "0" + i + " / 03" : "";
      },
      update: function (y) {
        /* it grows out of the page as it arrives, then holds the frame */
        var g = clamp((y - (this.top - vh * 0.55)) / (vh * 0.55));
        frameEl.style.scale = (0.84 + 0.16 * (g * g * (3 - 2 * g))).toFixed(4);
        var p = clamp((y - this.top) / Math.max(1, this.h - vh));
        this.set(p < STOPS[0] ? 0 : p < STOPS[1] ? 1 : p < STOPS[2] ? 2 : 3);
      }
    };
    addScene(sec, scene);
    scene.set(0);

    /* a keyboard reaches a market by tabbing to its link: bring its state up
       rather than leaving focus on something nobody can see */
    sec.addEventListener("focusin", function (e) {
      var st = e.target.closest ? e.target.closest(".pin__state") : null;
      if (!st) return;
      var n = states.indexOf(st);
      if (n < 0 || n === scene.i) return;
      var stop = n === 0 ? 0.05 : STOPS[n - 1] + 0.05;
      window.scrollTo({ top: scene.top + (scene.h - vh) * stop, behavior: motion() ? "smooth" : "auto" });
    });
  }

  function clearScenes() {
    if (liveIO) liveIO.disconnect();
    scenes.forEach(function (s) {
      s.el.classList.remove("live");
      if (s.el.__scene) delete s.el.__scene;
    });
    scenes = [];
  }

  function buildScenes(scope) {
    clearScenes();
    if (!rich()) return;
    liveIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var s = e.target.__scene;
        if (!s) return;
        s.live = e.isIntersecting;
        e.target.classList.toggle("live", e.isIntersecting);
      });
      schedule();
    }, { rootMargin: "45% 0px 45% 0px" });

    var root = scope || doc;
    var hero = root.querySelector(".hero");
    if (hero) heroScene(hero);
    root.querySelectorAll('[data-r="md"]').forEach(plateScene);
    var creed = root.querySelector(".creed");
    if (creed) creedScene(creed);
    var pin = root.querySelector(".pin");
    if (pin) pinScene(pin);
    measureAll();
  }


  /* ============================================================
     Start, and re-measure whenever the layout can have changed
     ============================================================ */
  /* the whole opening, on one clock (seconds) */
  var T = {
    count: 0.44,    /* the count runs and the rule draws           */
    stage: 0.38,    /* the photograph starts growing under the bands */
    bands: 0.50,    /* the first band clears                        */
    gap: 0.075,     /* between bands                                */
    band: 0.85,     /* one band's travel                            */
    nav: 0.86,      /* the nav's parts arrive                       */
    copy: 0.96,     /* the first headline line rises                */
    stageFade: 0.7, /* the photograph's own fade                    */
    stageGrow: 1.9  /* and its settle, the longest thing on screen  */
  };

  var preDone = false, opening = false;
  function openPage(scope) {
    var hero = (scope || doc).querySelector("[data-hero]");
    var pre = doc.getElementById("pre");

    /* a route change inside the artifact: the same order, no wait in front */
    if (preDone || !pre) {
      preDone = true;
      html.classList.add("lifted");
      openStage(hero);
      openCopy(hero, 0.06);
      /* frames can be throttled here too, and a pinned first keyframe would
         hold the new route blank. The resting state is in the stylesheet: this
         hands the page back to it either way. */
      window.setTimeout(finishAll, 2700);
      return;
    }
    preDone = true;

    if (!motion()) {
      if (pre.parentNode) pre.parentNode.removeChild(pre);
      html.classList.add("lifted");
      openStage(hero);
      openCopy(hero, 0);
      return;
    }

    var num = doc.getElementById("preN");
    var rule = doc.getElementById("preRule");
    var bands = all(doc, "#preBands > i");
    var timers = [];
    function at(sec, fn) { timers.push(window.setTimeout(fn, sec * 1000)); }

    /* no Motion: the count runs on a timer and the curtain lifts as one.
       rAF can be throttled before first paint, so this never uses frames. */
    if (!M) {
      var step = 0, steps = 11;
      var iv = window.setInterval(function () {
        step += 1;
        var p = Math.min(1, step / steps);
        if (num) num.textContent = p < 1 ? ("0" + Math.round(p * 100)).slice(-2) : "100";
        if (p >= 1) {
          window.clearInterval(iv);
          pre.classList.add("done", "lift");
          html.classList.add("lifted");
          openStage(hero);
          window.setTimeout(function () { openCopy(hero, 0); }, 220);
          window.setTimeout(function () { if (pre.parentNode) pre.parentNode.removeChild(pre); }, 1000);
        }
      }, 440 / steps);
      return;
    }

    opening = true;
    var last = T.bands + T.gap * Math.max(0, bands.length - 1) + T.band;
    var GESTURES = ["pointerdown", "keydown", "wheel", "touchstart"];

    function dropPre() { if (pre.parentNode) pre.parentNode.removeChild(pre); }

    /* Ending the opening is one idempotent act, and it is what every route
       into the end state calls: the gesture, the normal finish, and the
       failsafe. It does not merely take the curtain away. If frames were
       throttled the animations are still pinned on their first keyframe, so
       they are completed here rather than left holding the page dark. */
    function endOpening() {
      if (!opening) return;
      opening = false;
      off();
      timers.forEach(window.clearTimeout);
      openNav(0);
      openStage(hero);
      openCopy(hero, 0);
      finishAll();
      dropPre();
    }
    function off() {
      GESTURES.forEach(function (t) { window.removeEventListener(t, endOpening); });
    }
    /* any gesture ends it: an opening nobody can get past is a door, not a
       welcome */
    GESTURES.forEach(function (t) {
      window.addEventListener(t, endOpening, { passive: true });
    });

    /* The clock starts on the first frame, not on the first line of script.
       Before first paint rAF can be throttled, and Motion animates on frames
       while the staging below runs on timers: started together they cannot
       drift apart. */
    function begin() {
      if (begin.done) return;
      begin.done = true;

      /* layer 0 · the measure of the wait */
      if (rule) run(M.animate(rule, { scaleX: [0, 1] }, { duration: T.count, ease: [0.4, 0, 0.2, 1] }));
      if (num) {
        var mv = M.motionValue(0);
        mv.on("change", function (v) {
          num.textContent = v >= 99.5 ? "100" : ("0" + Math.round(v)).slice(-2);
        });
        run(M.animate(mv, 100, { duration: T.count, ease: "linear" }));
      }
      /* layer 1 · the photograph, already moving when it is uncovered */
      at(T.stage, function () { openStage(hero); });
      /* layer 2 · the count goes before the ground it sits on does */
      at(T.bands - 0.1, function () { pre.classList.add("done"); });
      /* layers 3 to 8 · the bands, one at a time, left to right */
      if (bands.length) {
        var b = run(M.animate(bands, { x: ["0%", "102%"] }, {
          duration: T.band, ease: MOVE,
          delay: M.stagger(T.gap, { startDelay: T.bands })
        }));
        if (b && b.then) b.then(dropPre, dropPre);
      }
      /* layer 9 · the nav, its own parts in order */
      at(T.nav, function () { openNav(0); });
      /* layers 10 and up · the copy */
      at(T.copy, function () { openCopy(hero, 0); });
      /* after the longest layer has landed. Derived from the score and the
         layers themselves rather than typed again: three numbers copied here
         by hand were three numbers that could fall out of step with the ones
         actually being played. */
      var ls = copyLayers(hero), lastCopy = 0;
      ls.forEach(function (l) {
        var end = T.copy + l.at + l.gap * Math.max(0, l.els.length - 1) +
                  (l.mask ? tok.dLine : tok.dCopy);
        if (end > lastCopy) lastCopy = end;
      });
      at(Math.max(last, T.stage + T.stageGrow, lastCopy) + 0.15, endOpening);
    }
    requestAnimationFrame(begin);
    window.setTimeout(begin, 500);
    /* nothing may ever sit behind a curtain because a frame did not come */
    window.setTimeout(endOpening, 3600);
  }

  /* The market named in the sentence is the plate you see. Three real
     markets, one line of copy, and the visitor changes the story. */
  function wirePick(scope) {
    var root = scope || doc;
    var pick = root.querySelector(".pick");
    if (!pick) return;
    var opts = [].slice.call(pick.querySelectorAll(".pick__opt"));
    var plates = [].slice.call(root.querySelectorAll(".hero__plate"));
    if (!opts.length || !plates.length) return;

    function warm() {
      plates.forEach(function (p) { if (p.loading === "lazy") p.loading = "eager"; });
    }
    var wasTimer = null;
    function show(name) {
      /* a plate that has not downloaded yet would dissolve to nothing */
      warm();
      opts.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === name)); });
      /* the plate being left holds underneath until the new one is fully in,
         so the ground never shows through the middle of the dissolve */
      plates.forEach(function (p) {
        var next = p.dataset.m === name;
        if (!next && p.classList.contains("on")) p.classList.add("was");
        p.classList.toggle("on", next);
      });
      window.clearTimeout(wasTimer);
      wasTimer = window.setTimeout(function () {
        plates.forEach(function (p) { p.classList.remove("was"); });
      }, 460);
      markPlate(root);
    }
    opts.forEach(function (b) {
      b.addEventListener("click", function () { show(b.dataset.m); });
      /* the other plates are lazy: warm them when the pointer arrives, so the
         dissolve never waits on a download */
      b.addEventListener("pointerenter", function () {
        plates.forEach(function (p) { if (p.loading === "lazy") p.loading = "eager"; });
      }, { once: true });
    });
    show(opts[0].dataset.m);
  }

  /* The scrim is set per photograph, so the hero has to say which photograph
     it is currently showing. The key comes from the manifest by way of the
     build, so it cannot drift from the picture it was measured against. */
  function markPlate(scope) {
    var hero = (scope || doc).querySelector(".hero");
    if (!hero) return;
    var lit = hero.querySelector(".hero__plate.on") || hero.querySelector(".hero__plate");
    if (lit && lit.dataset.k) hero.dataset.k = lit.dataset.k;
  }

  /* Every hero shows a plate, picker or no picker. The region pages carry no
     .pick, so wirePick() returned before anything was ever lit. */
  function lightHero(scope) {
    var stage = (scope || doc).querySelector(".hero__stage");
    if (stage && !stage.querySelector(".hero__plate.on")) {
      var first = stage.querySelector(".hero__plate");
      if (first) first.classList.add("on");
    }
    markPlate(scope);
  }

  function start(scope) {
    initReveals(scope);
    lightHero(scope);
    buildScenes(scope);
    wireNav();
    wirePick(scope);
    openPage(scope);
  }
  /* the scroll invitation is answered once, and then it goes */
  window.addEventListener("scroll", function () { html.classList.add("moved"); }, { once: true, passive: true });

  if (isSPA) showRoute(routeFromHash());
  else start(doc);
  window.__trReady = true;

  var rt = null, builtRich = rich();
  window.addEventListener("resize", function () {
    window.clearTimeout(rt);
    rt = window.setTimeout(function () {
      /* crossing 768px rebuilds rather than re-measures. This reads the query
         rather than trusting a matchMedia change event to arrive. */
      if (rich() !== builtRich) { builtRich = rich(); onMode(); }
      else measureAll();
      wireNav();
    }, 160);
  }, { passive: true });

  /* fonts and images can still move the page after first paint */
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { measureAll(); });
  window.addEventListener("load", function () { measureAll(); });
  if ("ResizeObserver" in window) {
    /* only the pinned section's own height can move the geometry this loop
       depends on. Observing the body re-measured on every unrelated change. */
    var roTarget = doc.querySelector(".pin");
    if (roTarget) {
      var rot = null;
      new ResizeObserver(function () {
        window.clearTimeout(rot);
        rot = window.setTimeout(measureAll, 200);
      }).observe(roTarget);
    }
  }

  /* crossing 768px or turning motion off rebuilds the scenes from scratch */
  function onMode() {
    readTokens();
    doc.querySelectorAll("[data-pin]").forEach(function (p) {
      p.removeAttribute("data-pin");
      var f = p.querySelector(".pin__frame");
      if (f) f.style.scale = "";
    });
    doc.querySelectorAll(".creed[data-live]").forEach(function (c) { c.removeAttribute("data-live"); });
    doc.querySelectorAll(".hero__in, .hero__plate, .frame img").forEach(function (el) {
      el.style.translate = ""; el.style.opacity = "";
    });
    clearScenes();
    var scope = isSPA ? doc.querySelector("[data-route]:not([hidden])") : doc;
    doc.querySelectorAll(".creed .ln, .pin__state > *").forEach(function (el) { el.classList.add("in"); });
    buildScenes(scope);
  }
  mWide.addEventListener("change", onMode);
  mReduce.addEventListener("change", onMode);

})();
