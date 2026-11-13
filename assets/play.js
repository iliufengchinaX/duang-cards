(function () {
  var STORE = 'duang.wb';
  var audio = new Audio();
  audio.preload = 'none';
  var current = null;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load() {
    var empty = { played: [], last: '', practice: false };
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return empty;
      var data = JSON.parse(raw);
      if (!data || !data.played || !data.played.concat) return empty;
      return {
        played: data.played,
        last: data.last || '',
        practice: !!data.practice
      };
    } catch (err) {
      return empty;
    }
  }

  function save(state) {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (err) {}
  }

  function live(text) {
    var el = document.getElementById('live');
    if (el) el.textContent = text;
  }

  function applyPractice(on) {
    document.body.classList.toggle('is-practice', on);
    var btn = document.querySelector('[data-practice]');
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '显示中文' : '遮住中文';
    }
    var zhs = document.querySelectorAll('.zh');
    for (var i = 0; i < zhs.length; i++) zhs[i].tabIndex = on ? 0 : -1;
  }

  function paint() {
    var state = load();
    var nodes = document.querySelectorAll('[data-progress]');
    for (var i = 0; i < nodes.length; i++) {
      var total = nodes[i].getAttribute('data-total') || '103';
      nodes[i].textContent = '已听 ' + state.played.length + ' / ' + total;
    }
    var meters = document.querySelectorAll('[data-meter]');
    var pct = Math.max(0, Math.min(100, (state.played.length / 103) * 100));
    for (var j = 0; j < meters.length; j++) {
      meters[j].setAttribute('aria-valuenow', String(state.played.length));
      var bar = meters[j].firstElementChild;
      if (bar) bar.style.width = pct + '%';
    }
    var link = document.querySelector('[data-resume]');
    var label = document.querySelector('[data-resume-label]');
    var detail = document.querySelector('[data-resume-detail]');
    if (link && state.last) {
      var href = link.getAttribute('href') || '';
      var root = href.split('#')[0];
      link.setAttribute('href', root + '#L' + state.last);
      if (label) label.textContent = '回到 ' + state.last;
    }
    if (detail) {
      detail.textContent = state.last
        ? '上次停在字母 ' + state.last + '。听过的单词记在这台设备上。'
        : '还没听过。103 个单词，从字母 A 开始。';
    }
    applyPractice(!!state.practice);
  }

  function clearPlay() {
    if (!current) return;
    current.card.classList.remove('is-on');
    current.btn.classList.remove('is-play');
    current.btn.removeAttribute('aria-pressed');
    var bars = current.btn.querySelector('.bars');
    if (bars) bars.setAttribute('hidden', '');
    current = null;
  }

  function fail() {
    if (!current) return;
    var card = current.card;
    clearPlay();
    card.classList.add('is-err');
    live('没能播放，再点一次');
  }

  audio.addEventListener('ended', clearPlay);
  audio.addEventListener('error', fail);

  function play(card, rate, btn) {
    if (!card || !btn) return;
    var src = rate === 's' ? card.getAttribute('data-s') : card.getAttribute('data-n');
    if (!src) return;
    card.classList.remove('is-err');
    clearPlay();
    card.classList.add('is-on');
    btn.classList.add('is-play');
    btn.setAttribute('aria-pressed', 'true');
    var bars = btn.querySelector('.bars');
    if (bars) bars.removeAttribute('hidden');
    current = { card: card, btn: btn };
    var word = card.getAttribute('data-word') || '';
    live((rate === 's' ? '慢速播放 ' : '正在播放 ') + word);
    audio.src = src;
    var pending = audio.play();
    if (pending && pending.catch) pending.catch(fail);
    if (card.getAttribute('data-track') === '1') {
      var state = load();
      if (state.played.indexOf(word) === -1) state.played.push(word);
      var letter = card.getAttribute('data-letter');
      if (letter) state.last = letter;
      save(state);
      paint();
    }
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target.closest) return;
    var zh = target.closest('.zh');
    if (zh) {
      if (document.body.classList.contains('is-practice')) zh.classList.toggle('shown');
      return;
    }
    var hit = target.closest('[data-rate]');
    if (!hit) return;
    var card = hit.closest('.word');
    if (!card) return;
    var rate = hit.getAttribute('data-rate') === 's' ? 's' : 'n';
    var btn = card.querySelector(rate === 's' ? '.play-s' : '.play-n');
    play(card, rate, btn);
  });

  var practiceBtn = document.querySelector('[data-practice]');
  if (practiceBtn) {
    practiceBtn.addEventListener('click', function () {
      var state = load();
      state.practice = !state.practice;
      save(state);
      applyPractice(state.practice);
    });
  }

  function centerRail(anchor) {
    var rail = document.querySelector('.rail');
    if (!rail || !anchor) return;
    if (rail.scrollWidth > rail.clientWidth + 8) {
      rail.scrollLeft = anchor.offsetLeft - rail.clientWidth / 2 + anchor.offsetWidth / 2;
    } else if (rail.scrollHeight > rail.clientHeight + 8) {
      rail.scrollTop = anchor.offsetTop - rail.clientHeight / 2 + anchor.offsetHeight / 2;
    }
  }

  function setCurrent(id) {
    var links = document.querySelectorAll('.rail a');
    var found = null;
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute('href') === '#' + id;
      links[i].classList.toggle('is-current', on);
      if (on) {
        links[i].setAttribute('aria-current', 'true');
        found = links[i];
      } else {
        links[i].removeAttribute('aria-current');
      }
    }
    centerRail(found);
  }

  function jumpToHash(behavior) {
    var id = (location.hash || '').replace(/^#/, '');
    if (!id) return false;
    var el = document.getElementById(id);
    if (!el) return false;
    var nav = document.querySelector('.topbar');
    var rail = document.querySelector('.rail');
    var navH = nav ? nav.offsetHeight : 0;
    var railH = 0;
    if (rail && window.innerWidth < 960) railH = rail.offsetHeight + 8;
    var y = window.pageYOffset + el.getBoundingClientRect().top - navH - railH - 12;
    window.scrollTo({ top: y < 0 ? 0 : y, left: 0, behavior: behavior || 'auto' });
    setCurrent(id);
    return true;
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return;
    if (!document.getElementById(href.slice(1))) return;
    e.preventDefault();
    if (location.hash !== href) history.pushState(null, '', href);
    jumpToHash(reduced ? 'auto' : 'smooth');
  });
  window.addEventListener('popstate', function () { jumpToHash('auto'); });

  var units = document.querySelectorAll('.unit');
  var landed = jumpToHash('auto');
  if (units.length && 'IntersectionObserver' in window) {
    var unitIo = new IntersectionObserver(function (entries) {
      var best = null;
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        if (!best || entries[i].intersectionRatio >= best.intersectionRatio) best = entries[i];
      }
      if (best) setCurrent(best.target.id);
    }, { rootMargin: '-28% 0px -55% 0px', threshold: [0.15, 0.4] });
    for (var u = 0; u < units.length; u++) unitIo.observe(units[u]);
  }
  if (!landed && units.length) setCurrent('LA');

  if (!reduced && 'IntersectionObserver' in window) {
    var reveals = document.querySelectorAll('.reveal');
    var revIo = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.classList.add('in');
        revIo.unobserve(entries[i].target);
      }
    }, { threshold: 0.12 });
    for (var r = 0; r < reveals.length; r++) revIo.observe(reveals[r]);
  }

  var menu = document.querySelectorAll('.menu a[href^="#"]');
  if (menu.length && 'IntersectionObserver' in window) {
    var secIo = new IntersectionObserver(function (entries) {
      for (var n = 0; n < entries.length; n++) {
        if (!entries[n].isIntersecting) continue;
        for (var i = 0; i < menu.length; i++) {
          var on = menu[i].getAttribute('href') === '#' + entries[n].target.id;
          menu[i].classList.toggle('is-here', on);
        }
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    for (var m = 0; m < menu.length; m++) {
      var id = menu[m].getAttribute('href').slice(1);
      var sec = document.getElementById(id);
      if (sec) secIo.observe(sec);
    }
  }

  paint();
})();
