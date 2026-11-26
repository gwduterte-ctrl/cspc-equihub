/* EquiHub client script. Loaded from 'self' only (CSP). No inline handlers, no eval. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- skeleton screen goes away once the page structure is parsed
  var sk = document.getElementById('sk-screen');
  if (sk) sk.classList.add('is-done');

  // ---------- "Welcome to EquiHub!" screen (server adds it right after login)
  var welcome = document.getElementById('welcome');
  if (welcome && welcome.hasAttribute('data-auto')) setTimeout(function () { welcome.classList.add('is-done'); }, reduce ? 300 : 1200);
  function showWelcome() {
    if (document.getElementById('welcome')) return;
    var w = document.createElement('div');
    w.className = 'welcome-screen'; w.id = 'welcome'; w.setAttribute('role', 'status');
    w.innerHTML = '<div class="welcome-box"><img src="/img/logo-md.png" alt="CSPC EquiHub" width="96" height="96"><div class="spinner" aria-hidden="true"></div><p class="welcome-text">Welcome to EquiHub!</p></div>';
    document.body.appendChild(w);
  }

  // ---------- things that must also work on content inserted into the pop-up
  function init(root) {
    root.querySelectorAll('img[data-fallback]').forEach(function (img) {
      var swap = function () { var fb = img.getAttribute('data-fallback'); if (fb && img.getAttribute('src') !== fb) img.setAttribute('src', fb); };
      img.addEventListener('error', swap);
      if (img.complete && img.naturalWidth === 0) swap();
    });
    root.querySelectorAll('img[data-hide]').forEach(function (img) {
      var hide = function () { img.hidden = true; };
      img.addEventListener('error', hide);
      if (img.complete && img.naturalWidth === 0) hide();
    });
    var b = root.querySelector('[data-borrow]'), r = root.querySelector('[data-return]');
    if (b && r) {
      var sync = function () { if (b.value) { r.min = b.value; if (r.value && r.value < b.value) r.value = b.value; } };
      b.addEventListener('change', sync); sync();
    }
  }
  init(document);

  // ---------- menu toggles
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-toggle'));
      if (!el) return;
      if (el.id === 'admin-side' && window.matchMedia('(min-width: 861px)').matches) { // desktop: collapse / expand
        btn.setAttribute('aria-expanded', String(!el.closest('.admin').classList.toggle('is-collapsed')));
        return;
      }
      btn.setAttribute('aria-expanded', String(el.classList.toggle('open')));
    });
  });

  // ---------- notifications inside the side menu: open from the bell link, mark as read when opened
  var notif = document.querySelector('[data-notifs]');
  if (notif) {
    var csrf = (document.querySelector('meta[name=csrf-token]') || {}).content || '';
    if (location.hash === '#notifications') notif.open = true;
    window.addEventListener('hashchange', function () { if (location.hash === '#notifications') notif.open = true; });
    notif.addEventListener('toggle', function () {
      var badge = notif.querySelector('[data-unread]');
      if (!notif.open || !badge) return;
      fetch('/account/notifications/read', { method: 'POST', credentials: 'same-origin', headers: { 'X-Fetch': '1', 'X-CSRF-Token': csrf } })
        .then(function (r) { if (r.ok) { badge.remove(); notif.querySelectorAll('.nf.is-new').forEach(function (li) { li.classList.remove('is-new'); }); var fm = notif.querySelector('.notif-read-form'); if (fm) fm.remove(); } });
    });
  }

  // ---------- dialogs: result card (server) and confirmation card (before deleting)
  var flashDlg = document.getElementById('flash-dlg');
  if (flashDlg) {
    var okBtn = flashDlg.querySelector('.dlg-ok'); if (okBtn) okBtn.focus({ preventScroll: true });
    setTimeout(function () { if (flashDlg.parentNode) flashDlg.remove(); }, 5400);
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-dlg-close]');
    if (c) { var d = c.closest('.dlg'); if (d) d.remove(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && flashDlg && flashDlg.parentNode) flashDlg.remove();
  });
  function confirmDialog(o, onYes) {
    var prev = document.activeElement, root = document.createElement('div');
    root.className = 'dlg is-confirm' + (o.tone === 'primary' ? ' dlg--primary' : '');
    root.setAttribute('role', 'alertdialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="dlg-backdrop" data-cancel></div><div class="dlg-card" tabindex="-1"><span class="dlg-ic"><span class="material-icons" aria-hidden="true">warning_amber</span></span>' +
      '<h2></h2><p></p><div class="dlg-actions"><button class="dlg-btn dlg-no" type="button" data-cancel></button><button class="dlg-btn dlg-yes" type="button"></button></div></div>';
    root.querySelector('h2').textContent = o.title; root.querySelector('p').textContent = o.text;
    var no = root.querySelector('.dlg-no'), yes = root.querySelector('.dlg-yes');
    no.textContent = o.no; yes.textContent = o.yes;
    document.body.appendChild(root); no.focus();
    function close() { document.removeEventListener('keydown', onKey, true); root.remove(); if (prev && prev.focus) prev.focus({ preventScroll: true }); }
    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); (document.activeElement === no ? yes : no).focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', function (ev) { if (ev.target.closest('[data-cancel]')) close(); });
    yes.addEventListener('click', function () { close(); onYes(); });
  }
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.matches) return;
    // the question belongs either to the form, or to the button that was pressed (Approve / Decline share one form)
    var src = e.submitter && e.submitter.hasAttribute && e.submitter.hasAttribute('data-confirm') ? e.submitter : (f.matches('form[data-confirm]') ? f : null);
    if (!src) return;
    e.preventDefault(); e.stopImmediatePropagation();
    confirmDialog({
      title: src.getAttribute('data-confirm-title') || 'Are you sure?', text: src.getAttribute('data-confirm'),
      yes: src.getAttribute('data-confirm-yes') || 'Yes, delete!', no: src.getAttribute('data-confirm-no') || 'No, keep it.', tone: src.getAttribute('data-confirm-tone')
    }, function () { if (src !== f && src.getAttribute('formaction')) f.action = src.getAttribute('formaction'); f.submit(); });
  }, true);

  // a whole table row opens its pop-up (links, buttons and fields inside keep working on their own)
  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('[data-row-link]');
    if (!row || e.target.closest('a, button, input, select, textarea, summary, form')) return;
    var a = row.querySelector('a[data-modal]'); if (a) a.click();
  });

  // ---------- privacy pop-up: the button stays off until the box is ticked, then it closes without a reload
  var cf = document.querySelector('form[data-consent]');
  if (cf) {
    var cb = cf.querySelector('input[type=checkbox]'), cbtn = cf.querySelector('button[type=submit]'), cwrap = cf.closest('[data-consent-wrap]');
    cbtn.disabled = true;
    cb.addEventListener('change', function () { cbtn.disabled = !cb.checked; });
    if (cwrap && cwrap.classList.contains('is-consent')) {
      cb.focus({ preventScroll: true });
      cwrap.addEventListener('keydown', function (e) { // keep Tab inside the dialog
        if (e.key !== 'Tab') return;
        var f = cwrap.querySelectorAll('a[href], button:not([disabled]), input'), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
    cf.addEventListener('submit', function (e) {
      e.preventDefault(); if (!cb.checked) return;
      fetch(cf.action, { method: 'POST', credentials: 'same-origin', headers: { 'X-Fetch': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(cf)) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.ok) { if (cwrap) cwrap.remove(); } else cf.submit(); })
        .catch(function () { cf.submit(); });
    });
  }

  // ---------- category form: live image preview
  var catInput = document.getElementById('cat-image-input');
  if (catInput) {
    catInput.addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = document.getElementById('cat-img-preview');
        var ph  = document.getElementById('cat-img-placeholder');
        img.src = e.target.result;
        img.hidden = false;
        if (ph) ph.hidden = true;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- department form: live logo preview
  var deptInput = document.getElementById('dept-logo-input');
  if (deptInput) {
    deptInput.addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = document.getElementById('dept-logo-preview');
        var ph  = document.getElementById('dept-logo-placeholder');
        img.src = e.target.result;
        img.hidden = false;
        if (ph) ph.hidden = true;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- equipment form: live image preview
  var equipInput = document.getElementById('equip-image-input');
  if (equipInput) {
    equipInput.addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = document.getElementById('equip-img-preview');
        var ph  = document.getElementById('equip-img-placeholder');
        img.src = e.target.result;
        img.hidden = false;
        if (ph) ph.hidden = true;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- show / hide password
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-toggle-pass]');
    if (!b) return;
    var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.querySelector('.material-icons').textContent = show ? 'visibility_off' : 'visibility';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  // ---------- user side menu: collapse to icons (remembered on this device)
  var acc = document.querySelector('[data-acc-side]');
  if (acc) {
    var accBtn = acc.querySelector('[data-acc-collapse]');
    var setMini = function (on) {
      acc.classList.toggle('is-mini', on);
      accBtn.setAttribute('aria-expanded', String(!on)); accBtn.setAttribute('aria-label', on ? 'Expand menu' : 'Collapse menu');
      accBtn.querySelector('.material-icons').textContent = on ? 'chevron_right' : 'chevron_left';
      try { localStorage.setItem('hh-acc-mini', on ? '1' : '0'); } catch (err) { /* private mode */ }
    };
    try { if (localStorage.getItem('hh-acc-mini') === '1' && window.matchMedia('(min-width: 861px)').matches) setMini(true); } catch (err) { /* ignore */ }
    accBtn.addEventListener('click', function () { setMini(!acc.classList.contains('is-mini')); });
    acc.querySelector('summary').addEventListener('click', function () { if (acc.classList.contains('is-mini')) setMini(false); });
  }

  // ---------- anything wider than its box scrolls sideways: touch swipe, shift+wheel, or mouse drag
  document.querySelectorAll('.table-wrap, .req-scroll, .req-tabs, .jump').forEach(function (el) {
    var down = false, moved = false, sx = 0, sl = 0;
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || el.scrollWidth <= el.clientWidth || (e.target.closest && e.target.closest('input, select, textarea'))) return;
      down = true; moved = false; sx = e.pageX; sl = el.scrollLeft;
    });
    window.addEventListener('mousemove', function (e) {
      if (!down) return;
      var dx = e.pageX - sx;
      if (Math.abs(dx) > 4) { moved = true; el.classList.add('is-dragging'); }
      if (moved) el.scrollLeft = sl - dx;
    });
    window.addEventListener('mouseup', function () { down = false; el.classList.remove('is-dragging'); });
    el.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  });

  // ---------- "how to borrow" slider
  document.querySelectorAll('[data-slider]').forEach(function (s) {
    var slides = s.querySelectorAll('.slide'), dotsBox = s.querySelector('[data-dots]'), i = 0, timer;
    var dots = Array.prototype.map.call(slides, function (_, n) {
      var d = document.createElement('button'); d.type = 'button'; d.setAttribute('aria-label', 'Go to slide ' + (n + 1));
      d.addEventListener('click', function () { show(n); restart(); }); dotsBox.appendChild(d); return d;
    });
    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      dots.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
    }
    function restart() { clearInterval(timer); if (!reduce) timer = setInterval(function () { show(i + 1); }, 6000); }
    s.querySelector('[data-prev]').addEventListener('click', function () { show(i - 1); restart(); });
    s.querySelector('[data-next]').addEventListener('click', function () { show(i + 1); restart(); });
    s.addEventListener('mouseenter', function () { clearInterval(timer); }); s.addEventListener('mouseleave', restart);
    show(0); restart();
  });

  // ---------- login without a page flash: errors show inline, success shows the welcome screen
  var form = function (body) { return new URLSearchParams(new FormData(body)); };
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.matches) return;
    if (f.matches('form[data-login]')) {
      e.preventDefault();
      var err = document.querySelector('[data-login-error]'), msg = document.querySelector('[data-login-msg]'), btn = f.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      fetch(f.action, { method: 'POST', credentials: 'same-origin', headers: { 'X-Fetch': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(f) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.ok) { showWelcome(); window.location.assign(j.redirect); return; }
          if (msg) msg.textContent = j.error || 'Could not log in.';
          if (err) err.hidden = false;
          if (btn) btn.disabled = false;
        })
        .catch(function () { f.submit(); });
    } else if (f.matches('form[data-modal-form]')) {
      e.preventDefault();
      var sb = f.querySelector('button[type=submit]'); if (sb) sb.disabled = true;
      fetch(f.action, { method: 'POST', credentials: 'same-origin', headers: { 'X-Modal': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(f) })
        .then(function (r) {
          if ((r.headers.get('content-type') || '').indexOf('application/json') === 0) return r.json().then(function (j) { return { json: j }; });
          return r.text().then(function (t) { return { html: t }; });
        })
        .then(function (o) {
          if (o.json && o.json.redirect) { window.location.href = o.json.redirect; return; }
          if (o.json && o.json.error) { if (sb) sb.disabled = false; setBody('<div class="errors modal-err" role="alert"><p></p></div>', o.json.error); return; }
          if (o.html) setBody(o.html);
        })
        .catch(function () { f.submit(); });
    }
  });

  // ---------- pop-up cards: blurred page behind, card grows out of the one you clicked
  var modal = null, lastFocus = null, token = 0, modalOrigin = null;
  function ensureModal() {
    if (modal) return modal;
    var root = document.createElement('div');
    root.className = 'modal'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Equipment');
    root.innerHTML = '<div class="modal-backdrop" data-close></div><div class="modal-panel" tabindex="-1">' +
      '<button class="modal-close" type="button" data-close aria-label="Close"><span class="material-icons" aria-hidden="true">close</span></button>' +
      '<div class="modal-body" aria-live="polite"></div></div>';
    document.body.appendChild(root);
    modal = { root: root, panel: root.querySelector('.modal-panel'), body: root.querySelector('.modal-body') };
    return modal;
  }
  var SKELETON = '<div class="modal-skel" aria-hidden="true"><i class="sk"></i><div><i class="sk sk-line"></i><i class="sk sk-line short"></i><i class="sk sk-line"></i><i class="sk sk-line"></i><i class="sk sk-btn"></i></div></div>';

  function setBody(html, errText) {
    var m = ensureModal();
    m.body.innerHTML = html;
    if (errText) { var p = m.body.querySelector('.modal-err p'); if (p) p.textContent = errText; }
    m.body.removeAttribute('aria-busy');
    init(m.body);
    var h = m.body.querySelector('h1'); if (h) m.root.setAttribute('aria-label', h.textContent);
    if (!reduce && m.body.animate) m.body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    var first = m.body.querySelector('input:not([type=hidden]), textarea, a.btn, button'); (first || m.panel).focus({ preventScroll: true });
  }

  function growFrom(origin) {
    var m = modal;
    if (reduce || !origin || !m.panel.animate) return;
    var r = origin.getBoundingClientRect(), p = m.panel.getBoundingClientRect();
    if (!p.width || !r.width) return;
    var s = Math.max(r.width / p.width, 0.2);
    var dx = (r.left + r.width / 2) - (p.left + p.width / 2), dy = (r.top + r.height / 2) - (p.top + p.height / 2);
    m.panel.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')', opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  function openModal(href, origin, mode) { // mode: 'push' | 'restore'
    var m = ensureModal(), fresh = m.root.hidden, t = ++token;
    if (fresh) {
      modalOrigin = location.pathname + location.search; // the page that stays blurred behind
      lastFocus = document.activeElement;
      document.body.classList.add('modal-open');
      m.root.hidden = false; m.root.classList.remove('is-closing');
      if (mode !== 'restore') history.pushState({ m: 1 }, '', href);
    } else if (mode !== 'restore') history.replaceState({ m: 1 }, '', href);
    m.body.innerHTML = SKELETON; m.body.setAttribute('aria-busy', 'true');
    if (fresh) growFrom(origin);
    fetch(href, { credentials: 'same-origin', headers: { 'X-Modal': '1', 'X-Origin': modalOrigin || '/' } })
      .then(function (r) {
        if (t !== token) return null;
        if (r.status === 401) return r.json().then(function (j) { window.location.href = j.login; return null; });
        if (!r.ok) { window.location.href = href; return null; }
        return r.text();
      })
      .then(function (html) { if (html != null && t === token) setBody(html); })
      .catch(function () { window.location.href = href; });
  }
  function teardown() {
    var m = modal; if (!m || m.root.hidden) return;
    token++; m.root.classList.add('is-closing');
    setTimeout(function () {
      m.root.hidden = true; m.root.classList.remove('is-closing'); m.body.innerHTML = '';
      document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }, reduce ? 0 : 180);
  }
  function closeModal() {
    if (!modal || modal.root.hidden) return;
    if (history.state && history.state.m) history.back(); // popstate does the teardown
    else { var u = modal.root.getAttribute('data-close-url'); if (u) history.replaceState(null, '', u); teardown(); }
  }
  // pop-up rendered by the server (direct link / refresh / return from login): adopt it
  var serverModal = document.querySelector('.modal[data-server]');
  if (serverModal) {
    modal = { root: serverModal, panel: serverModal.querySelector('.modal-panel'), body: serverModal.querySelector('.modal-body') };
    document.body.classList.add('modal-open'); modalOrigin = serverModal.getAttribute('data-close-url');
    init(modal.body);
    var f0 = modal.body.querySelector('input:not([type=hidden]), textarea, a.btn'); (f0 || modal.panel).focus({ preventScroll: true });
  }
  // after login the guest lands on the page they clicked on, and the borrow form opens again over it
  var again = document.querySelector('[data-reopen]');
  if (again) openModal(again.getAttribute('data-reopen'), null, 'push');

  window.addEventListener('popstate', function (e) {
    if (modal && !modal.root.hidden) teardown();
    else if (e.state && e.state.m) openModal(location.pathname + location.search, null, 'restore');
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var a = e.target.closest('a[data-modal]');
    if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault(); openModal(a.getAttribute('href'), a.closest('.equip') || null, 'push'); return;
    }
    var c = e.target.closest('[data-close]');
    if (c && modal && modal.root.contains(c)) { e.preventDefault(); closeModal(); }
  });
  document.addEventListener('keydown', function (e) {
    if (!modal || modal.root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return; // keep keyboard focus inside the pop-up
    var f = modal.panel.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- dashboard: return calendar prev/next navigation
  var calWidget = document.getElementById('cal-widget');
  if (calWidget) {
    function buildCalCell(c, y, m) {
      var span = document.createElement('span');
      var pad = function (n) { return String(n).padStart(2, '0'); };
      span.setAttribute('role', c.n ? 'button' : 'cell');
      span.setAttribute('tabindex', c.n ? '0' : '-1');
      span.className = 'cal-d' +
        (c.out   ? ' cal-out'   : '') +
        (c.today ? ' cal-today' : '') +
        (c.sun   ? ' cal-sun'   : '') +
        (c.n     ? (c.late ? ' cal-late' : ' cal-due') : '');
      if (c.n && !c.out) span.dataset.calDay = y + '-' + pad(m) + '-' + pad(c.d);
      if (c.n) span.title = c.n + ' return' + (c.n === 1 ? '' : 's') + ' due';
      span.textContent = c.d;
      return span;
    }

    function loadCalendar(y, m) {
      fetch('/admin/dashboard/calendar?y=' + y + '&m=' + m, { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (cal) {
          calWidget.dataset.y = cal.y;
          calWidget.dataset.m = cal.m;
          document.getElementById('cal-month-label').textContent = cal.label;
          var grid = document.getElementById('cal-grid');
          var headers = Array.prototype.slice.call(grid.querySelectorAll('.cal-w'));
          grid.innerHTML = '';
          headers.forEach(function (hdr) { grid.appendChild(hdr); });
          cal.cells.forEach(function (c) { grid.appendChild(buildCalCell(c, cal.y, cal.m)); });
        })
        .catch(function () {});
    }

    calWidget.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cal-prev],[data-cal-next]');
      if (!btn) return;
      var y = parseInt(calWidget.dataset.y, 10);
      var m = parseInt(calWidget.dataset.m, 10);
      if (btn.hasAttribute('data-cal-prev')) { m--; if (m < 1)  { m = 12; y--; } }
      else                                   { m++; if (m > 12) { m = 1;  y++; } }
      loadCalendar(y, m);
    });

    // ---------- calendar day click: show returns popup
    var popup     = document.getElementById('cal-day-popup');
    var popTitle  = document.getElementById('cal-popup-title');
    var popBody   = document.getElementById('cal-popup-body');
    var popClose  = document.getElementById('cal-popup-close');

    function openDayPopup(date) {
      popTitle.textContent = 'Returns due ' + date;
      popBody.innerHTML = '<p class="cal-popup-empty">Loading…</p>';
      popup.hidden = false;
      fetch('/admin/dashboard/day?date=' + date, { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('Server error ' + r.status);
          return r.json();
        })
        .then(function (rows) {
          if (!rows.length) { popBody.innerHTML = '<p class="cal-popup-empty">No returns due on this day.</p>'; return; }
          popBody.innerHTML = '';
          rows.forEach(function (r) {
            var div = document.createElement('div');
            div.className = 'cal-popup-row';
            div.innerHTML =
              '<div style="flex:1;min-width:0">' +
                '<a href="/admin/requests/' + r.id + '" class="cal-row-ref">' + r.reference_no + '</a>' +
                '<p class="cal-row-equip">' + r.equipment_name + ' &times; ' + r.quantity + '</p>' +
                '<p class="cal-row-name">' + r.full_name + '</p>' +
              '</div>' +
              '<span class="pill ' + (r.overdue ? 'pill--overdue' : 'pill--approved') + '">' + (r.overdue ? 'Overdue' : 'Due today') + '</span>';
            popBody.appendChild(div);
          });
        })
        .catch(function () { popBody.innerHTML = '<p class="cal-popup-empty">Could not load data.</p>'; });
    }

    function closeDayPopup() { popup.hidden = true; }

    document.addEventListener('click', function (e) {
      var day = e.target.closest('[data-cal-day]');
      if (day) { openDayPopup(day.dataset.calDay); return; }
      if (popup && !popup.hidden) {
        if (e.target === popClose || e.target.closest('#cal-popup-close') || e.target.classList.contains('cal-popup-backdrop')) closeDayPopup();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popup && !popup.hidden) closeDayPopup();
    });
  }

})();
