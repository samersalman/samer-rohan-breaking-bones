(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var st = { year: 2026, tax: [], papers: [], cards: {}, topics: [], subs: [], total: 0, ready: false, shown: [] };
  var uid = 0;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function has(p, k, id) { return (p[k] || []).indexOf(id) > -1; }
  function labelOf(id) {
    for (var i = 0; i < st.tax.length; i++) {
      if (st.tax[i].id === id) return st.tax[i].label;
      for (var j = 0; j < st.tax[i].subs.length; j++) if (st.tax[i].subs[j].id === id) return st.tax[i].subs[j].label;
    }
    return id;
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* same surname + given-name-prefix matching as js/app.js */
  function isMe(name) {
    var t = name.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    function h(sur, giv) { return t.indexOf(sur) > -1 && t.some(function (w) { return w.indexOf(giv) === 0; }); }
    return h('salman', 'samer') || h('phadke', 'rohan');
  }
  function fmtDate(d) {
    var t = new Date(d + 'T12:00:00');
    return isNaN(t) ? d : t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /* ---------- filter logic ---------- */
  /* AND across checked topics; OR within the checked subtopics of one topic;
     a checked topic with no subtopic checked means every paper in that topic. */
  function matches(p, topics, subs, skipTopic) {
    if (!topics.length) return true;
    if (!(p.topics && p.topics.length)) return false;
    for (var i = 0; i < topics.length; i++) {
      var t = topics[i];
      if (t === skipTopic) continue;
      if (!has(p, 'topics', t)) return false;
      var chosen = subOf(t).filter(function (s) { return subs.indexOf(s) > -1; });
      if (chosen.length && !chosen.some(function (s) { return has(p, 'subtopics', s); })) return false;
    }
    return true;
  }
  function subOf(t) {
    for (var i = 0; i < st.tax.length; i++) if (st.tax[i].id === t) return st.tax[i].subs.map(function (s) { return s.id; });
    return [];
  }
  function parentOf(s) {
    for (var i = 0; i < st.tax.length; i++) for (var j = 0; j < st.tax[i].subs.length; j++) if (st.tax[i].subs[j].id === s) return st.tax[i].id;
    return null;
  }
  /* count of papers shown if this topic (or subtopic) were the only change: other checked topics
     still apply, the topic's own subtopic choices are ignored for the topic count */
  function topicCount(t) {
    var others = st.topics.filter(function (x) { return x !== t; });
    return st.papers.filter(function (p) {
      return has(p, 'topics', t) && matches(p, others, st.subs);
    }).length;
  }
  function subCount(s) {
    var t = parentOf(s);
    var others = st.topics.filter(function (x) { return x !== t; });
    return st.papers.filter(function (p) {
      return has(p, 'subtopics', s) && matches(p, others, st.subs);
    }).length;
  }

  /* ---------- URL state ---------- */
  function readUrl() {
    var q = new URLSearchParams(location.search);
    var ts = (q.get('topics') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var ss = (q.get('sub') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var topics = [], subs = [];
    st.tax.forEach(function (t) { if (ts.indexOf(t.id) > -1) topics.push(t.id); });
    st.tax.forEach(function (t) {
      t.subs.forEach(function (s) {
        if (ss.indexOf(s.id) > -1) { subs.push(s.id); if (topics.indexOf(t.id) < 0) topics.push(t.id); }
      });
    });
    st.topics = st.tax.map(function (t) { return t.id; }).filter(function (id) { return topics.indexOf(id) > -1; });
    st.subs = subs;
  }
  function writeUrl() {
    var parts = [];
    if (st.topics.length) parts.push('topics=' + st.topics.join(','));
    if (st.subs.length) parts.push('sub=' + st.subs.join(','));
    var url = location.pathname + (parts.length ? '?' + parts.join('&') : '') + location.hash;
    try { history.replaceState(null, '', url); } catch (e) { /* ignore */ }
  }

  /* ---------- filters ---------- */
  function chip(kind, id, text, extra) {
    var lab = el('label', 'chip' + (kind === 'sub' ? ' sub' : ''));
    var inp = el('input'); inp.type = 'checkbox'; inp.value = id; inp.dataset.kind = kind; inp.id = kind + '-' + id;
    var box = el('span', 'box'); box.setAttribute('aria-hidden', 'true');
    var tx = el('span', 'label', text);
    var n = el('span', 'num', '0'); n.dataset.for = id;
    lab.appendChild(inp); lab.appendChild(box); lab.appendChild(tx); lab.appendChild(n);
    return lab;
  }
  function buildFilters() {
    var host = $('topic-groups');
    st.tax.forEach(function (t) {
      var g = el('div', 'group'); g.dataset.topic = t.id;
      g.appendChild(chip('topic', t.id, t.label));
      var dr = el('div', 'drawer'); dr.id = 'drawer-' + t.id;
      var inn = el('div', 'drawer-in');
      var fs = el('fieldset', 'subs');
      fs.appendChild(el('legend', null, 'Subtopics of ' + t.label));
      t.subs.forEach(function (s) { fs.appendChild(chip('sub', s.id, s.label)); });
      inn.appendChild(fs); dr.appendChild(inn); g.appendChild(dr);
      host.appendChild(g);
    });
    host.addEventListener('change', function (e) {
      var inp = e.target;
      if (!inp || inp.tagName !== 'INPUT') return;
      if (inp.dataset.kind === 'topic') {
        if (inp.checked) { if (st.topics.indexOf(inp.value) < 0) st.topics.push(inp.value); }
        else {
          st.topics = st.topics.filter(function (x) { return x !== inp.value; });
          var own = subOf(inp.value);
          st.subs = st.subs.filter(function (s) { return own.indexOf(s) < 0; });
        }
      } else {
        if (inp.checked) { if (st.subs.indexOf(inp.value) < 0) st.subs.push(inp.value); }
        else st.subs = st.subs.filter(function (x) { return x !== inp.value; });
      }
      update(true);
    });
    $('clear-all').addEventListener('click', function () {
      st.topics = []; st.subs = [];
      update(true);
      var f = document.querySelector('#topic-groups input'); if (f) f.focus({ preventScroll: true });
    });
  }
  function syncFilters() {
    document.querySelectorAll('#topic-groups input').forEach(function (inp) {
      var k = inp.dataset.kind, on = k === 'topic' ? st.topics.indexOf(inp.value) > -1 : st.subs.indexOf(inp.value) > -1;
      inp.checked = on;
    });
    st.tax.forEach(function (t) {
      var open = st.topics.indexOf(t.id) > -1;
      var dr = $('drawer-' + t.id);
      dr.classList.toggle('open', open);
      var ti = $('topic-' + t.id);
      ti.setAttribute('aria-controls', dr.id);
    });
    document.querySelectorAll('.num[data-for]').forEach(function (n) {
      var id = n.dataset.for;
      var c = parentOf(id) ? subCount(id) : topicCount(id);
      n.textContent = c;
      var lab = n.closest('label'); lab.classList.toggle('none', c === 0 && !lab.querySelector('input').checked);
      n.setAttribute('aria-label', plural(c, 'paper'));
    });
    $('clear-all').disabled = !st.topics.length && !st.subs.length;
  }

  /* ---------- cards ---------- */
  function authorsEl(list) {
    var p = el('div', 'authors'); p.appendChild(document.createTextNode('By '));
    var n = list.length;
    var names = el('span', 'names'); names.id = 'ta' + (uid++);
    list.forEach(function (a, i) {
      names.appendChild(isMe(a) ? el('b', null, a) : document.createTextNode(a));
      if (i < n - 1) names.appendChild(document.createTextNode(n === 2 ? ' and ' : (i === n - 2 ? ', and ' : ', ')));
    });
    p.appendChild(names);
    if (n > 8) {
      names.classList.add('clamped');
      var tg = el('button', 'au-toggle', 'Show all ' + n + ' authors');
      tg.type = 'button'; tg.setAttribute('aria-expanded', 'false'); tg.setAttribute('aria-controls', names.id);
      tg.addEventListener('click', function () {
        var open = tg.getAttribute('aria-expanded') === 'true';
        names.classList.toggle('clamped', open);
        tg.setAttribute('aria-expanded', String(!open));
        tg.textContent = open ? 'Show all ' + n + ' authors' : 'Show fewer';
      });
      p.appendChild(tg);
    }
    return p;
  }
  function cardEl(p) {
    var sum = p.summary && String(p.summary).trim() ? String(p.summary).trim() : '';
    var head = p.headline && String(p.headline).trim() ? String(p.headline).trim() : '';
    var pub = p.reviewed === true;
    var a = el('article', 'tcard'); a.dataset.id = p.id;
    var eb = el('p', 'eyebrow');
    eb.appendChild(el('span', null, p.journal || 'Journal'));
    eb.appendChild(el('span', null, fmtDate(p.date)));
    if (!(pub && (sum || head))) eb.appendChild(el('span', 'stamp soon', 'Summary coming'));
    a.appendChild(eb);
    a.appendChild(el('h3', null, pub && head ? head : p.title));
    if (pub && head) a.appendChild(el('p', 'authors', 'Paper: ' + p.title));
    if (pub && sum) {
      var sm = el('div', 'summary'); sm.appendChild(el('h4', null, 'In short')); sm.appendChild(el('p', null, sum)); a.appendChild(sm);
    } else a.appendChild(el('p', 'soon-line', 'A plain-English summary is coming.'));
    if (p.authors && p.authors.length) a.appendChild(authorsEl(p.authors));
    var url = p.url || (p.doi ? 'https://doi.org/' + p.doi : '');
    if (url) { var l = el('a', 'read-link', 'Read the paper'); l.href = url; l.target = '_blank'; l.rel = 'noopener'; a.appendChild(l); }
    var tags = (p.topics || []).concat(p.subtopics || []);
    if (tags.length) {
      var ul = el('ul', 'tags'); ul.setAttribute('aria-label', 'Topics');
      (p.topics || []).forEach(function (t) { ul.appendChild(el('li', 'tag', labelOf(t))); });
      (p.subtopics || []).forEach(function (t) { ul.appendChild(el('li', 'tag sub', labelOf(t))); });
      a.appendChild(ul);
    }
    return a;
  }

  /* ---------- render with FLIP ---------- */
  function render(animate) {
    var list = $('list');
    var shown = st.papers.filter(function (p) { return matches(p, st.topics, st.subs); });
    if (!st.topics.length) shown = st.papers.slice();
    var ids = {}; shown.forEach(function (p) { ids[p.id] = true; });
    var go = animate && !reduced.matches && list.animate;

    list.querySelectorAll('.ghost').forEach(function (g) { g.remove(); });
    var first = {}, listBox = list.getBoundingClientRect(), gone = [];
    if (go) {
      Array.prototype.forEach.call(list.children, function (c) {
        if (!c.dataset.id) return;
        c.getAnimations().forEach(function (an) { an.finish(); });
        first[c.dataset.id] = c.getBoundingClientRect();
        if (!ids[c.dataset.id]) gone.push(c);
      });
      gone.forEach(function (c) {
        var r = first[c.dataset.id], g = c.cloneNode(true);
        g.classList.add('ghost'); g.setAttribute('aria-hidden', 'true'); g.removeAttribute('data-id');
        g.querySelectorAll('[id]').forEach(function (x) { x.removeAttribute('id'); });
        g.querySelectorAll('a,button').forEach(function (x) { x.tabIndex = -1; });
        g.style.top = (r.top - listBox.top) + 'px'; g.style.left = '0'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
        list.appendChild(g);
        var an = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
        an.onfinish = an.oncancel = function () { g.remove(); };
      });
    }
    var kids = shown.map(function (p) { return st.cards[p.id]; });
    var ghosts = Array.prototype.slice.call(list.querySelectorAll('.ghost'));
    list.replaceChildren.apply(list, kids.concat(ghosts));
    st.shown = shown;

    if (go) {
      shown.forEach(function (p, i) {
        var c = st.cards[p.id], f = first[p.id];
        if (f) {
          var l = c.getBoundingClientRect(), dy = f.top - l.top;
          if (Math.abs(dy) > 1) c.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
        } else {
          c.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 250, delay: Math.min(i, 6) * 25, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
        }
      });
    }
    $('empty').hidden = shown.length > 0;
    $('count').textContent = 'Showing ' + shown.length + ' of ' + st.total + ' papers';
  }

  function update(animate) {
    syncFilters();
    render(animate);
    writeUrl();
  }

  /* ---------- init ---------- */
  function sortNewest(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }
  Promise.all([
    fetch('data/papers.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch('data/taxonomy.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
  ]).then(function (res) {
    var d = res[0];
    st.tax = res[1].topics || [];
    if (d.site && d.site.year) st.year = Number(d.site.year);
    st.papers = (d.papers || []).filter(function (p) { return !p.hidden && Number(p.year) === st.year; }).sort(sortNewest);
    st.total = st.papers.length;
    st.papers.forEach(function (p) { st.cards[p.id] = cardEl(p); });
    document.body.classList.add('no-anim');
    buildFilters();
    readUrl();
    update(false);
    window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { document.body.classList.remove('no-anim'); }); });
    st.ready = true;
  }).catch(function (err) {
    $('data-error').hidden = false; $('count').textContent = 'Papers could not load';
    console.warn('topics data failed to load', err);
  });
})();
