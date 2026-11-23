(function () {
  'use strict';
  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var ROT = [-1.1, 0.8, -0.5, 1.2, -0.9, 0.4, 1.0, -1.2, 0.6, -0.3, 1.1, -0.7];
  var GLOSSARY = [
    ['AUROC', 'A score from 0.5 to 1 for how well a prediction tool separates people who had an outcome from people who did not. 0.5 is a coin flip; closer to 1 is better.'],
    ['Risk score', 'A short checklist of facts about a patient that adds up to a number. A higher number means a higher chance of a certain outcome.'],
    ['Machine learning', 'Software that finds patterns in many past examples and uses them to make estimates for new cases, instead of following hand-written rules.'],
    ['Cohort', 'A group of people followed over time or looked at together, such as everyone who had the same type of surgery at a set of hospitals.'],
    ['Odds ratio', 'A way to compare two groups. 1.0 means no difference. 1.5 means the odds of the outcome were about one and a half times higher in one group.'],
    ['Retrospective study', 'A study that looks back at records that already exist, rather than enrolling people and following them going forward.']
  ];
  var IG = 'https://www.instagram.com/breakkingbones/';
  var preview = /[?&]preview=1(&|$)/.test(location.search);
  var $ = function (id) { return document.getElementById(id); };
  var state = { year: 2026, papers: [], openMonth: null, target: null, pushed: false, busy: null, lastTile: null };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function visible(p) { return !p.hidden && Number(p.year) === state.year; }
  function inMonth(m) { return state.papers.filter(function (p) { return visible(p) && Number(p.month) === m; }); }
  function monthName(m) { var n = MONTHS[m - 1]; return n.charAt(0).toUpperCase() + n.slice(1); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- calendar ---------- */
  function renderCalendar() {
    $('year-label').textContent = state.year;
    var cal = $('calendar'); cal.textContent = '';
    for (var m = 1; m <= 12; m++) {
      var n = inMonth(m).length;
      var b = el('button', 'tile' + (n ? '' : ' quiet'));
      b.type = 'button'; b.dataset.month = m;
      b.style.setProperty('--rot', ROT[m - 1] + 'deg');
      b.setAttribute('aria-label', monthName(m) + ' ' + state.year + ', ' + (n ? n + (n === 1 ? ' paper' : ' papers') : 'quiet month'));
      var nu = el('span', 'num'); var u = 'url("assets/month-' + pad(m) + '.svg")'; nu.style.webkitMaskImage = u; nu.style.maskImage = u; b.appendChild(nu);
      var nm = el('span', 'name', monthName(m));
      var ct = el('span', 'count', n ? n + (n === 1 ? ' paper' : ' papers') : 'quiet month');
      b.appendChild(nm); b.appendChild(ct);
      b.addEventListener('click', (function (mm, bb) { return function () { state.lastTile = bb; go(mm); }; })(m, b));
      var li = el('div'); li.setAttribute('role', 'listitem'); li.appendChild(b); cal.appendChild(li);
    }
  }
  function tileFor(m) { return document.querySelector('.tile[data-month="' + m + '"]'); }

  /* ---------- papers ---------- */
  var uid = 0;
  function isMe(name) {
    var t = name.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    function has(sur, giv) { return t.indexOf(sur) > -1 && t.some(function (w) { return w.indexOf(giv) === 0; }); }
    return has('salman', 'samer') || has('phadke', 'rohan');
  }
  function authorsEl(list) {
    var p = el('div', 'authors'); p.appendChild(document.createTextNode('By '));
    var n = list.length;
    var names = el('span', 'names'); names.id = 'au' + (uid++);
    list.forEach(function (a, i) {
      names.appendChild(isMe(a) ? el('b', null, a) : document.createTextNode(a));
      if (i < n - 1) names.appendChild(document.createTextNode(n === 2 ? ' and ' : (i === n - 2 ? ', and ' : ', ')));
    });
    p.appendChild(names);
    if (n > 8) {
      names.classList.add('clamped');
      var tg = el('button', 'au-toggle', 'Show all ' + n + ' authors');
      tg.type = 'button'; tg.setAttribute('aria-expanded', 'false'); tg.setAttribute('aria-controls', names.id);
      tg.onclick = function () {
        var open = tg.getAttribute('aria-expanded') === 'true';
        names.classList.toggle('clamped', open);
        tg.setAttribute('aria-expanded', String(!open));
        tg.textContent = open ? 'Show all ' + n + ' authors' : 'Show fewer';
      };
      p.appendChild(tg);
    }
    return p;
  }
  function fmtDate(d) {
    var t = new Date(d + 'T12:00:00');
    return isNaN(t) ? d : t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function paperEl(p, i) {
    var sum = p.summary && String(p.summary).trim() ? String(p.summary).trim() : '';
    var show = (p.reviewed === true || preview) && ((p.headline && p.headline.trim()) || sum);
    var draft = show && p.reviewed !== true;
    var a = el('article', 'paper'); a.style.setProperty('--i', Math.min(i, 6));
    var eb = el('p', 'eyebrow');
    eb.appendChild(el('span', null, p.journal || 'Journal'));
    eb.appendChild(el('span', null, fmtDate(p.date)));
    if (draft) eb.appendChild(el('span', 'stamp draft', 'DRAFT'));
    else if (!show) eb.appendChild(el('span', 'stamp soon', 'Summary coming'));
    a.appendChild(eb);
    a.appendChild(el('h3', null, show && p.headline && p.headline.trim() ? p.headline : p.title));
    if (show && p.headline && p.headline.trim()) { var t = el('p', 'authors', 'Paper: ' + p.title); a.appendChild(t); }
    if (p.authors && p.authors.length) a.appendChild(authorsEl(p.authors));
    if (show) {
      var id = 'v' + (uid++);
      var plain = el('div'); plain.id = id + 'p';
      if (sum) { var sm = el('div', 'summary'); sm.appendChild(el('h4', null, 'In short')); sm.appendChild(el('p', null, sum)); plain.appendChild(sm); }
      if (p.bottomLine && p.bottomLine.trim() && !/^summary coming\.?$/i.test(p.bottomLine.trim()) || !sum) {
        var bl = el('div', 'bottom'); bl.appendChild(el('h4', null, 'The bottom line')); bl.appendChild(el('p', null, p.bottomLine || ''));
        plain.appendChild(bl);
      }
      if (p.takeaways && p.takeaways.length) {
        var tk = el('div', 'takes'); tk.appendChild(el('h4', null, 'Key takeaways'));
        var ul = el('ul'); p.takeaways.slice(0, 3).forEach(function (x) { ul.appendChild(el('li', null, x)); });
        tk.appendChild(ul); plain.appendChild(tk);
      }
      if (p.technical && p.technical.trim()) {
        var tech = el('div', 'tech'); tech.id = id + 't'; tech.hidden = true;
        tech.appendChild(el('p', null, p.technical));
        var tg = el('div', 'toggle'); tg.setAttribute('role', 'group'); tg.setAttribute('aria-label', 'Reading level');
        var bp = el('button', null, 'Plain'), bt = el('button', null, 'Technical');
        bp.type = bt.type = 'button'; bp.setAttribute('aria-pressed', 'true'); bt.setAttribute('aria-pressed', 'false');
        bp.setAttribute('aria-controls', plain.id); bt.setAttribute('aria-controls', tech.id);
        function set(isTech) {
          plain.hidden = isTech; tech.hidden = !isTech;
          bp.setAttribute('aria-pressed', String(!isTech)); bt.setAttribute('aria-pressed', String(isTech));
        }
        bp.onclick = function () { set(false); }; bt.onclick = function () { set(true); };
        tg.appendChild(bp); tg.appendChild(bt); a.appendChild(tg);
        var views = el('div', 'views'); views.appendChild(plain); views.appendChild(tech); a.appendChild(views);
      } else a.appendChild(plain);
    } else {
      a.appendChild(el('p', 'soon-line', 'A plain-English summary is coming.'));
    }
    var url = p.url || (p.doi ? 'https://doi.org/' + p.doi : '');
    if (url) { var l = el('a', 'read-link', 'Read the paper'); l.href = url; l.target = '_blank'; l.rel = 'noopener'; a.appendChild(l); }
    return a;
  }

  /* ---------- month view ---------- */
  function renderMonth(m) {
    var mv = $('month-view'); mv.textContent = '';
    var list = inMonth(m).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var head = el('div', 'month-head');
    var back = el('button', 'back', 'Back'); back.type = 'button'; back.setAttribute('aria-label', 'Back to the calendar'); back.onclick = close;
    var h = el('h2', null, monthName(m) + ' ' + state.year); h.id = 'month-title'; h.tabIndex = -1;
    var meta = el('span', 'meta', list.length ? list.length + (list.length === 1 ? ' paper' : ' papers') : 'Quiet');
    var navs = el('div', 'navs');
    var pv = el('button', 'nav', '‹'), nx = el('button', 'nav', '›');
    pv.type = nx.type = 'button'; pv.setAttribute('aria-label', 'Previous month'); nx.setAttribute('aria-label', 'Next month');
    pv.disabled = m === 1; nx.disabled = m === 12;
    pv.onclick = function () { swap(m - 1); }; nx.onclick = function () { swap(m + 1); };
    navs.appendChild(pv); navs.appendChild(nx);
    head.appendChild(back); head.appendChild(h); head.appendChild(meta); head.appendChild(navs);
    var body = el('div', 'month-body');
    if (!list.length) {
      var q = el('div', 'quiet-state');
      q.appendChild(el('div', 'zz', 'z z z'));
      q.appendChild(el('h3', null, 'A quiet month'));
      q.appendChild(el('p', null, 'Nothing new this month, but come back soon.'));
      body.appendChild(q);
    } else list.forEach(function (p, i) { body.appendChild(paperEl(p, i)); });
    mv.appendChild(head); mv.appendChild(body);
    mv.scrollTop = 0;
    $('live').textContent = monthName(m) + ' ' + state.year + ', ' + (list.length ? list.length + ' papers' : 'quiet month');
    return head;
  }
  function showMonth(m) {
    state.openMonth = m;
    var head = renderMonth(m);
    $('month-view').hidden = false; $('page').inert = true; $('page').setAttribute('aria-hidden', 'true');
    document.body.classList.add('lock');
    return head;
  }
  function hideMonth() {
    state.openMonth = null;
    $('month-view').hidden = true; $('page').inert = false; $('page').removeAttribute('aria-hidden');
    document.body.classList.remove('lock');
  }

  function animated() { return !reduced.matches; }
  function vtName(node, name) { if (node) node.style.viewTransitionName = name || ''; }

  function openMonth(m) {
    var tile = state.lastTile || tileFor(m); var done = false;
    function after() { var h = $('month-title'); if (h) h.focus({ preventScroll: true }); }
    if (!animated()) { showMonth(m); $('month-view').classList.add('fade-in'); after(); setTimeout(function () { $('month-view').classList.remove('fade-in'); }, 160); return; }
    var t = null;
    if (document.startViewTransition) {
      vtName(tile, 'month-' + m);
      try {
        t = document.startViewTransition({ update: function () { vtName(tile, ''); var h = showMonth(m); vtName(h, 'month-' + m); }, types: ['open'] });
      } catch (err) { t = null; vtName(tile, ''); }
    }
    if (t) {
      state.busy = t;
      t.finished.catch(function () {}).then(function () { vtName(document.querySelector('.month-head'), ''); vtName(tile, ''); if (state.busy === t) state.busy = null; });
      t.updateCallbackDone.then(after, after);
    } else {
      var first = tile.getBoundingClientRect();
      var head = showMonth(m); after();
      var last = head.getBoundingClientRect();
      head.animate([{ transformOrigin: 'top left', transform: 'translate(' + (first.left - last.left) + 'px,' + (first.top - last.top) + 'px) scale(' + (first.width / last.width) + ',' + (first.height / last.height) + ')', opacity: .4 }, { transformOrigin: 'top left', transform: 'none', opacity: 1 }],
        { duration: window.innerWidth < 600 ? 480 : 560, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }
  function closeMonthView(m) {
    var tile = tileFor(m) || state.lastTile;
    function after() { if (tile) tile.focus({ preventScroll: false }); }
    if (!animated()) { hideMonth(); after(); return; }
    var t = null;
    if (document.startViewTransition) {
      vtName(document.querySelector('.month-head'), 'month-' + m);
      try {
        t = document.startViewTransition({ update: function () { vtName(document.querySelector('.month-head'), ''); hideMonth(); vtName(tile, 'month-' + m); }, types: ['close'] });
      } catch (err) { t = null; vtName(document.querySelector('.month-head'), ''); }
    }
    if (t) {
      state.busy = t;
      t.finished.catch(function () {}).then(function () { vtName(tile, ''); if (state.busy === t) state.busy = null; });
      t.updateCallbackDone.then(after, after);
    } else {
      var mv = $('month-view');
      var a = mv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
      a.onfinish = function () { hideMonth(); after(); };
    }
  }
  function swap(m) {
    if (m < 1 || m > 12) return;
    if (state.busy) state.busy.skipTransition();
    state.target = m; state.lastTile = tileFor(m);
    showMonth(m); $('month-title').focus({ preventScroll: true });
    history.replaceState({ m: m }, '', '#' + MONTHS[m - 1]);
  }

  /* ---------- routing ---------- */
  function parseHash() { var i = MONTHS.indexOf(location.hash.slice(1).toLowerCase()); return i < 0 ? null : i + 1; }
  function go(m) { if (state.busy) state.busy.skipTransition(); history.pushState({ m: m }, '', '#' + MONTHS[m - 1]); state.pushed = true; route(); }
  function close() {
    if (state.busy) state.busy.skipTransition();
    if (state.pushed) { state.pushed = false; history.back(); }
    else { history.replaceState(null, '', location.pathname + location.search); route(); }
  }
  var initial = true;
  function route() {
    var m = parseHash(), prev = state.target;
    if (m === prev && !(initial && m)) { initial = false; return; }
    state.target = m;
    if (m) {
      if (initial) { initial = false; state.lastTile = tileFor(m); showMonth(m); $('month-title').focus({ preventScroll: true }); return; }
      if (state.busy) state.busy.skipTransition();
      if (prev) { state.lastTile = tileFor(m); showMonth(m); $('month-title').focus({ preventScroll: true }); return; }
      openMonth(m);
    } else {
      initial = false;
      if (prev) closeMonthView(prev);
    }
  }
  window.addEventListener('popstate', route);
  document.addEventListener('keydown', function (e) {
    if (state.target == null) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) swap(state.target - 1);
    else if (e.key === 'ArrowRight' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) swap(state.target + 1);
  });

  /* ---------- glossary, headshots, init ---------- */
  function initGlossary() {
    var box = $('glossary'), def = $('gloss-def');
    GLOSSARY.forEach(function (g) {
      var b = el('button', 'term', g[0]); b.type = 'button'; b.setAttribute('aria-expanded', 'false');
      b.onclick = function () {
        var open = b.getAttribute('aria-expanded') === 'true';
        box.querySelectorAll('.term').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        if (open) { def.textContent = 'Pick a word above to see what it means.'; return; }
        b.setAttribute('aria-expanded', 'true'); def.textContent = '';
        def.appendChild(el('strong', null, g[0] + '. ')); def.appendChild(document.createTextNode(g[1]));
      };
      box.appendChild(b);
    });
  }
  document.querySelectorAll('img[data-fallback]').forEach(function (im) {
    im.addEventListener('error', function () { if (im.src.indexOf('headshots-placeholder') < 0) im.src = im.dataset.fallback; });
  });

  initGlossary();
  if (preview) $('preview-note').hidden = false;
  renderCalendar();
  fetch('data/papers.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    state.papers = d.papers || [];
    if (d.site && d.site.year) state.year = Number(d.site.year);
    renderCalendar(); route();
    if (state.openMonth) renderMonth(state.openMonth);
  }).catch(function () { $('data-error').hidden = false; console.warn('papers.json failed to load'); });
})();
