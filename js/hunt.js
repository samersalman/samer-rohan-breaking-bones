/* Easter egg: tap the hero logo until it breaks, then a scavenger hunt through the papers.
   Clues live in data/hunt.json. Answers are stored only as SHA-256 hashes, and the final
   phrase is encrypted with the answers, so neither can be read from the page source.
   Regenerate data/hunt.json with scripts/make_hunt.py. */
(function () {
  'use strict';
  var KEY = 'bb-hunt-v1', CLICKS = 7;
  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var egg = document.getElementById('egg'), panel = document.getElementById('hunt'), pill = document.getElementById('hunt-pill');
  if (!egg || !panel || !pill) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var data = null, st = load(), hits = 0;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- the egg ---------- */
  var branches = egg.querySelectorAll('.cb');
  egg.addEventListener('click', function () {
    if (egg.classList.contains('broken')) { openHunt(); return; }
    hits++;
    if (hits >= CLICKS) { breakEgg(); return; }
    egg.style.setProperty('--crack', String(100 - 100 * hits / (CLICKS - 1)));
    branches.forEach(function (b) { if (hits >= Number(b.getAttribute('data-at'))) b.classList.add('on'); });
    if (!reduced.matches) { egg.classList.remove('shake'); void egg.offsetWidth; egg.classList.add('shake'); }
  });
  function breakEgg() {
    egg.classList.remove('shake');
    egg.classList.add('broken');
    egg.setAttribute('aria-label', 'Breaking Bones logo, cracked open. Open the scavenger hunt');
    setTimeout(openHunt, reduced.matches ? 0 : 700);
  }

  /* ---------- crypto helpers ---------- */
  function bytes(s) { return new TextEncoder().encode(s); }
  function digest(s) { return crypto.subtle.digest('SHA-256', bytes(s)).then(function (b) { return new Uint8Array(b); }); }
  function hex(u) { return Array.prototype.map.call(u, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function unhex(h) { var u = new Uint8Array(h.length / 2); for (var i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; }
  function norm(v) { var m = String(v).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? m[0] : ''; }
  function reveal() {
    var c = unhex(data.final), blocks = [];
    for (var j = 0; j * 32 < c.length; j++) blocks.push(digest('bb-hunt-final|' + st.answers.join('|') + '|' + j));
    return Promise.all(blocks).then(function (ks) {
      var out = new Uint8Array(c.length);
      for (var i = 0; i < c.length; i++) out[i] = c[i] ^ ks[Math.floor(i / 32)][i % 32];
      return new TextDecoder().decode(out);
    });
  }

  /* ---------- the hunt ---------- */
  function getData() {
    if (data) return Promise.resolve(data);
    return fetch('data/hunt.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { data = d; return d; });
  }
  function openHunt() {
    getData().then(function () {
      if (!st) { st = { step: -1, answers: [], hints: [] }; save(); }
      render(); show();
    }).catch(function () { console.warn('hunt.json failed to load'); });
  }
  function show() {
    panel.hidden = false; pill.hidden = true;
    var h = document.getElementById('hunt-title'); if (h) h.focus({ preventScroll: true });
  }
  function hide() {
    panel.hidden = true; updatePill(); pill.hidden = false; pill.focus({ preventScroll: true });
  }
  function updatePill() {
    if (!st || !data) return;
    var n = data.steps.length;
    pill.textContent = st.step >= n ? 'Hunt complete' : st.step < 0 ? 'Scavenger hunt' : 'Scavenger hunt ' + (st.step + 1) + '/' + n;
  }
  pill.addEventListener('click', function () { getData().then(function () { render(); show(); }); });

  function frame(eyebrow, title) {
    panel.textContent = '';
    var top = el('div', 'h-top');
    top.appendChild(el('p', 'eyebrow', eyebrow));
    var x = el('button', 'h-x', 'Hide'); x.type = 'button'; x.onclick = hide; top.appendChild(x);
    panel.appendChild(top);
    var h = el('h2', null, title); h.id = 'hunt-title'; h.tabIndex = -1; panel.appendChild(h);
    if (st.step >= 0) {
      var dots = el('div', 'h-dots'); dots.setAttribute('aria-hidden', 'true');
      data.steps.forEach(function (_, i) { dots.appendChild(el('span', i < st.step ? 'done' : i === st.step ? 'now' : '')); });
      panel.appendChild(dots);
    }
  }

  function render(msg) {
    var n = data.steps.length;
    if (st.step < 0) return renderIntro();
    if (st.step >= n) return renderDone();
    var i = st.step, s = data.steps[i];
    frame('Scavenger hunt', 'Clue ' + (i + 1) + ' of ' + n);
    panel.appendChild(el('p', null, s.clue));
    var f = el('form'); f.noValidate = true;
    var lab = el('label', 'sr-only', 'Your answer'); lab.htmlFor = 'hunt-in';
    var inp = el('input'); inp.id = 'hunt-in'; inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.placeholder = 'Your answer';
    var go = el('button', 'h-btn', 'Check'); go.type = 'submit';
    f.appendChild(lab); f.appendChild(inp); f.appendChild(go);
    var out = el('p', 'h-msg' + (msg ? ' ok' : '')); out.setAttribute('aria-live', 'polite'); if (msg) out.textContent = msg;
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = norm(inp.value);
      if (!v) { out.className = 'h-msg bad'; out.textContent = 'The answer is a number. Give it a try.'; return; }
      digest('bb-hunt|' + i + '|' + v).then(function (h) {
        if (hex(h) === s.hash) {
          st.answers[i] = v; st.step++; save();
          render(st.step < n ? 'Correct! On to the next clue.' : null);
          if (st.step < n) { var nx = document.getElementById('hunt-in'); if (nx) nx.focus(); }
        } else {
          out.className = 'h-msg bad'; out.textContent = 'Not quite. Try again, or take a hint.';
          inp.classList.remove('nope'); void inp.offsetWidth; inp.classList.add('nope');
        }
      });
    };
    panel.appendChild(f); panel.appendChild(out);
    var used = st.hints[i] || 0;
    var ul = el('ul', 'h-hints');
    for (var k = 0; k < used; k++) {
      var li = el('li', null, s.hints[k]);
      if (k === 0 && s.month) {
        li.appendChild(document.createTextNode(' '));
        var a = el('a', null, 'Open ' + cap(MONTHS[s.month - 1])); a.href = '#' + MONTHS[s.month - 1];
        li.appendChild(a);
      }
      ul.appendChild(li);
    }
    if (used) panel.appendChild(ul);
    if (used < s.hints.length) {
      var hb = el('button', 'h-link', used ? 'Another hint' : 'Need a hint?'); hb.type = 'button';
      hb.onclick = function () { st.hints[i] = used + 1; save(); render(); var b = panel.querySelector('.h-hints li:last-child'); if (b) b.scrollIntoView({ block: 'nearest' }); };
      panel.appendChild(hb);
    }
    updatePill();
  }

  function renderIntro() {
    frame('You broke it', 'You found our secret scavenger hunt');
    panel.appendChild(el('p', null, 'Five clues are hidden in the papers on this site. Each answer is a number you will find in a paper\'s "In short" summary.'));
    panel.appendChild(el('p', null, 'Solve all five to unlock a secret phrase. DM it to us on Instagram to tell us you finished.'));
    var b = el('button', 'h-btn', 'Start the hunt'); b.type = 'button';
    b.onclick = function () { st.step = 0; save(); render(); var nx = document.getElementById('hunt-in'); if (nx) nx.focus(); };
    panel.appendChild(b);
    updatePill();
  }

  function renderDone() {
    frame('Hunt complete', 'You cracked it!');
    panel.appendChild(el('p', null, 'DM us this exact phrase on Instagram so we know you finished the hunt:'));
    var ph = el('strong', 'phrase', '...'); panel.appendChild(ph);
    var row = el('div', 'h-row');
    var cp = el('button', 'h-btn', 'Copy phrase'); cp.type = 'button';
    var ig = el('a', null, 'DM @BreakkingBones'); ig.href = data.dm || 'https://ig.me/m/breakkingbones'; ig.target = '_blank'; ig.rel = 'noopener';
    row.appendChild(cp); row.appendChild(ig); panel.appendChild(row);
    var again = el('button', 'h-link', 'Start over'); again.type = 'button'; again.style.marginTop = '.9rem';
    again.onclick = function () { st = { step: 0, answers: [], hints: [] }; save(); render(); };
    panel.appendChild(again);
    reveal().then(function (t) {
      ph.textContent = t;
      cp.onclick = function () {
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { cp.textContent = 'Copied!'; }, function () {});
      };
    }).catch(function () { ph.textContent = 'Something went wrong. Press Start over and try again.'; });
    updatePill();
  }

  /* resume: if someone already started, keep a small button to get back in */
  if (st && st.step >= 0) getData().then(function () { updatePill(); pill.hidden = false; }).catch(function () {});
})();
