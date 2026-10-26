/* Vidflow — routeur + vues. Sources : YouTube (API officielle) ou catalogue local.
   Aucune vidéo n'est copiée : la lecture passe par le lecteur YouTube officiel. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var main = $('#main');
  var sidebar = $('#sidebar');
  var mini = $('#miniplayer');
  var toastEl = $('#toast');
  var modal = $('#modal');

  var current = { path: '', videoId: null, queue: [], listId: null, filter: 'all', tab: 'videos', token: 0 };

  function brand() { return Store.state.brandName || 'Céleste'; }

  function applyBrand() {
    var label = $('#brand-name');
    if (label) { label.textContent = brand(); }
    document.title = brand() + ' — vidéos, sans format court';
  }

  /* ---------------- formatage ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nf(n, d) { return n.toLocaleString('fr-FR', { maximumFractionDigits: d || 0 }); }

  function compact(n) {
    if (!n) { return '0'; }
    if (n >= 1e9) { return nf(n / 1e9, 1) + ' Md'; }
    if (n >= 1e6) { return nf(n / 1e6, 1) + ' M'; }
    if (n >= 1e3) { return nf(n / 1e3, n >= 1e5 ? 0 : 1) + ' k'; }
    return nf(n);
  }

  function views(n) { return n ? compact(n) + ' vue' + (n > 1 ? 's' : '') : ''; }
  function subsLabel(n) { return n ? compact(n) + ' abonné' + (n > 1 ? 's' : '') : ''; }

  function ago(ts) {
    var s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    var steps = [[31536000, 'an', 'ans'], [2592000, 'mois', 'mois'], [604800, 'semaine', 'semaines'],
      [86400, 'jour', 'jours'], [3600, 'heure', 'heures'], [60, 'minute', 'minutes']];
    for (var i = 0; i < steps.length; i++) {
      var v = Math.floor(s / steps[i][0]);
      if (v >= 1) { return 'il y a ' + v + ' ' + (v > 1 ? steps[i][2] : steps[i][1]); }
    }
    return "à l'instant";
  }

  function clock(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(s);
  }

  function fullDate(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function metaLine(v) {
    return [views(v.views), v.published ? ago(v.published) : ''].filter(Boolean).join(' • ');
  }

  /* ---------------- fragments ---------------- */

  function initial(name) { return (String(name).trim().charAt(0) || '?').toUpperCase(); }

  function avatarHtml(name, hue, url, cls) {
    if (url) {
      return '<img class="avatar ' + (cls || '') + '" src="' + esc(url) +
        '" alt="" loading="lazy" data-name="' + esc(name) + '" data-hue="' + (hue || 258) + '">';
    }
    return '<span class="avatar ' + (cls || '') + '" style="background:hsl(' + (hue || 258) +
      ' 55% 45%)" aria-hidden="true">' + esc(initial(name)) + '</span>';
  }

  function channelAvatar(v, cls) {
    return avatarHtml(v.channelTitle, v.hue, v.channelAvatar, cls);
  }

  function posterHtml(v) {
    if (v.thumb) {
      return '<img class="thumb-img" src="' + esc(v.thumb) + '" alt="" loading="lazy" decoding="async"' +
        ' data-name="' + esc(v.channelTitle) + '" data-hue="' + (v.hue || 258) + '">';
    }
    var h = v.hue || 258;
    return '<div class="poster" style="background:linear-gradient(135deg,hsl(' + h +
      ' 62% 32%),hsl(' + ((h + 42) % 360) + ' 58% 18%))" aria-hidden="true">' +
      '<svg class="mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/>' +
      '<path d="M10 8.5v7l6-3.5z"/></svg>' +
      '<span class="who">' + esc(v.channelTitle) + '</span>' +
      (v.category ? '<span class="cat">' + esc(v.category) + '</span>' : '') + '</div>';
  }

  var DOTS = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/>' +
    '<circle cx="12" cy="19" r="1.4"/></svg>';

  function thumbHtml(v, list) {
    var prog = Store.progressOf(v.id);
    var bar = prog && v.duration ? '<span class="bar"><i style="width:' +
      Math.min(100, Math.round(prog / v.duration * 100)) + '%"></i></span>' : '';
    return '<a class="thumb" href="#/watch?v=' + v.id + (list ? '&list=' + list : '') +
      '" aria-label="' + esc(v.title) + '">' + posterHtml(v) +
      (v.duration ? '<span class="time">' + clock(v.duration) + '</span>' : '') +
      (v.live ? '<span class="time live">EN DIRECT</span>' : '') + bar + '</a>';
  }

  function channelLink(v, inner) {
    return v.channelId
      ? '<a href="#/channel/' + esc(v.channelId) + '">' + inner + '</a>'
      : '<span>' + inner + '</span>';
  }

  function cardHtml(v, opts) {
    opts = opts || {};
    return '<article class="card" data-video="' + esc(v.id) + '">' + thumbHtml(v, opts.list) +
      '<div class="card-body">' +
      (opts.hideChannel ? '' : channelLink(v, channelAvatar(v))) +
      '<div class="card-text"><h3 class="card-title"><a href="#/watch?v=' + esc(v.id) +
      (opts.list ? '&list=' + opts.list : '') + '">' + esc(v.title) + '</a></h3>' +
      (opts.hideChannel ? '' : '<p class="card-meta">' + channelLink(v, esc(v.channelTitle)) + '</p>') +
      '<p class="card-meta">' + metaLine(v) + '</p></div></div>' +
      '<button class="icon-btn card-menu" data-action="menu" data-id="' + esc(v.id) +
      '" aria-label="Options de la vidéo">' + DOTS + '</button></article>';
  }

  function miniCardHtml(v, list) {
    return '<article class="card mini-card" data-video="' + esc(v.id) + '">' + thumbHtml(v, list) +
      '<div><h3 class="card-title"><a href="#/watch?v=' + esc(v.id) + (list ? '&list=' + list : '') +
      '">' + esc(v.title) + '</a></h3>' +
      '<p class="card-meta">' + esc(v.channelTitle) + '</p>' +
      '<p class="card-meta">' + metaLine(v) + '</p></div>' +
      '<button class="icon-btn card-menu" data-action="menu" data-id="' + esc(v.id) +
      '" aria-label="Options">' + DOTS + '</button></article>';
  }

  function rowCardHtml(v, opts) {
    opts = opts || {};
    return '<article class="row-card" data-video="' + esc(v.id) + '">' + thumbHtml(v, opts.list) +
      '<div><h3><a href="#/watch?v=' + esc(v.id) + (opts.list ? '&list=' + opts.list : '') + '">' +
      (opts.rank ? esc(opts.rank) + '. ' : '') + esc(v.title) + '</a></h3>' +
      '<p class="card-meta">' + metaLine(v) + '</p>' +
      '<p class="card-meta">' + channelLink(v, esc(v.channelTitle)) + '</p>' +
      (v.description ? '<p class="snippet">' + esc(v.description.split('\n')[0]) + '</p>' : '') +
      '</div><div class="tools-col">' +
      (opts.remove
        ? '<button class="icon-btn" data-action="' + opts.remove + '" data-id="' + esc(v.id) +
          '" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
        : '<button class="icon-btn" data-action="menu" data-id="' + esc(v.id) +
          '" aria-label="Options">' + DOTS + '</button>') + '</div></article>';
  }

  function gridHtml(list, opts) {
    opts = opts || {};
    if (!list.length) { return emptyHtml(opts.empty); }
    return '<div class="grid">' + list.map(function (v) { return cardHtml(v, opts); }).join('') + '</div>';
  }

  function rowsHtml(list, opts) {
    opts = opts || {};
    if (!list.length) { return emptyHtml(opts.empty); }
    return '<div class="rows">' + list.map(function (v, i) {
      return rowCardHtml(v, { remove: opts.remove, list: opts.list, rank: opts.ranked ? i + 1 : 0 });
    }).join('') + '</div>';
  }

  function emptyHtml(message) {
    return '<div class="empty"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3"/>' +
      '<path d="M10 9.5v5l4.5-2.5z"/></svg><p>' + esc(message || 'Rien à afficher pour le moment.') +
      '</p></div>';
  }

  function skeletonHtml(n) {
    var one = '<article class="card sk"><span class="thumb sk-box"></span>' +
      '<div class="card-body"><span class="avatar sk-box"></span>' +
      '<div class="card-text"><span class="sk-line"></span><span class="sk-line short"></span></div>' +
      '</div></article>';
    return '<div class="grid">' + new Array(n || 8).join(one) + '</div>';
  }

  function errorHtml(err) {
    var reason = err && err.reason;
    var help = {
      quotaExceeded: 'Le quota gratuit de ta clé API est atteint pour aujourd’hui. Il se recharge chaque jour.',
      dailyLimitExceeded: 'Quota quotidien atteint. Réessaie demain ou crée une autre clé.',
      keyInvalid: 'Clé API refusée. Vérifie-la dans Paramètres.',
      badRequest: 'Requête refusée par l’API. Vérifie la clé et ses restrictions.',
      forbidden: 'Accès refusé : l’API YouTube Data v3 doit être activée pour ce projet.',
      'no-key': 'Aucune clé API : ajoute-la dans Paramètres pour parcourir YouTube.'
    }[reason] || ('Erreur : ' + esc((err && err.message) || 'inconnue'));
    return '<div class="banner error"><strong>Impossible de charger les vidéos.</strong><br>' +
      esc(help) + ' <a href="#/settings">Ouvrir les paramètres</a></div>';
  }

  function onboardingHtml() {
    if (Catalog.mode() === 'yt') { return ''; }
    return '<div class="banner"><strong>Mode ' +
      (Catalog.mode() === 'links' ? 'liens' : 'démo') + '.</strong> ' +
      'Pour parcourir et rechercher les vraies vidéos YouTube, ajoute une clé API gratuite ' +
      '(YouTube Data v3) dans <a href="#/settings">Paramètres</a>. ' +
      'Sans clé, tu peux déjà coller des liens YouTube : ' +
      '<button class="pill solid" data-action="add-link">+ Ajouter une vidéo</button></div>';
  }

  /* ---------------- sidebar ---------------- */

  var ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/>',
    subs: '<path d="M4 7h16M6 11h12M4 15h16v4H4z"/>',
    history: '<path d="M12 7v5l4 2"/><circle cx="12" cy="12" r="8.5"/>',
    later: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 1.5"/>',
    liked: '<path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/><path d="M4 10h3v10H4z"/>',
    playlist: '<path d="M4 7h11M4 11h11M4 15h7"/><path d="M16 13.5v6l5-3z"/>',
    trending: '<path d="M3 17l5-6 4 3 5-7"/><path d="M17 7h4v4"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>'
  };

  function navItem(href, icon, label, count) {
    var active = location.hash.replace(/^#/, '') === href.replace(/^#/, '');
    return '<a class="nav-item" href="' + href + '"' + (active ? ' aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24">' + icon + '</svg><span>' + esc(label) + '</span>' +
      (count ? '<span class="count">' + count + '</span>' : '') + '</a>';
  }

  function renderSidebar() {
    var st = Store.state;
    var subNames = st.subChannels || {};

    var html = '<div class="nav-group">' +
      navItem('#/', ICONS.home, 'Accueil') +
      navItem('#/subs', ICONS.subs, 'Abonnements') +
      navItem('#/trending', ICONS.trending, 'Tendances') +
      (st.shortsBudgetMin
        ? navItem('#/shorts', ICONS.timer, 'Pause courte', clock(Store.shortsLeft()))
        : '') +
      '</div><div class="nav-group"><h3>Vous</h3>' +
      navItem('#/history', ICONS.history, 'Historique', st.history.length || '') +
      navItem('#/later', ICONS.later, 'À regarder plus tard', st.watchLater.length || '') +
      navItem('#/liked', ICONS.liked, "Vidéos que j'aime", st.liked.length || '') +
      navItem('#/playlists', ICONS.playlist, 'Playlists', st.playlists.length || '') +
      '</div>';

    var known = (Auth.isSignedIn() ? (Store.state.accountSubs || []) : st.subs.map(function (id) {
      var info = subNames[id] || {};
      return { id: id, name: info.name || (DB.channel(id) || {}).name || id, avatar: info.avatar || '' };
    }));
    if (known.length) {
      html += '<div class="nav-group"><h3>Abonnements</h3>' + known.slice(0, 12).map(function (c) {
        return '<a class="nav-item" href="#/channel/' + esc(c.id) + '">' +
          (c.avatar
            ? '<img class="av" src="' + esc(c.avatar) + '" alt="" data-name="' + esc(c.name) + '">'
            : '<span class="av" style="background:hsl(' + ((DB.channel(c.id) || {}).hue || 258) +
              ' 55% 45%)">' + esc(initial(c.name)) + '</span>') +
          '<span>' + esc(c.name) + '</span></a>';
      }).join('') +
      (known.length > 12 ? '<a class="nav-item" href="#/subs"><svg viewBox="0 0 24 24">' +
        '<path d="M6 9l6 6 6-6"/></svg><span>Tout afficher</span></a>' : '') + '</div>';
    }

    html += '<div class="nav-group">' + navItem('#/settings', ICONS.settings, 'Paramètres') + '</div>' +
      '<p class="sidebar-footer">' + esc(brand()) + ' — lecture via le lecteur YouTube officiel,' +
      ' sans format court.<br>Les données restent dans ce navigateur.</p>';

    sidebar.innerHTML = html;
  }

  function renderAccount() {
    var btn = $('#btn-account');
    var p = Auth.profile();
    btn.innerHTML = Auth.isSignedIn() && p
      ? (p.avatar ? '<img class="avatar" src="' + esc(p.avatar) + '" alt="" data-name="' +
          esc(p.name) + '">' : '<span class="avatar">' + esc(initial(p.name)) + '</span>')
      : '<span class="avatar guest" aria-hidden="true">?</span>';
    btn.setAttribute('aria-label', Auth.isSignedIn() && p ? 'Compte ' + p.name : 'Se connecter');
  }

  function syncAccount() {
    if (!Auth.isSignedIn()) { return Promise.resolve(); }
    return Catalog.subscriptions().then(function (list) {
      Store.set('accountSubs', list);
      renderSidebar();
    }).catch(function () { /* hors ligne : on garde ce qu'on a */ });
  }

  function signIn() {
    if (!Auth.isConfigured()) {
      toast('Ajoute d’abord l’ID client Google dans Paramètres');
      location.hash = '#/settings';
      return;
    }
    Auth.signIn().then(function () {
      toast('Connecté à YouTube');
      renderAccount();
      return syncAccount();
    }).then(function () { render(); })
      .catch(function (err) {
        var msgs = {
          'client-id-manquant': 'ID client Google manquant (Paramètres).',
          'gis-bloque': 'Script Google bloqué par le navigateur.',
          'popup-fermee': 'Connexion annulée.',
          popup_closed: 'Connexion annulée.',
          popup_failed_to_open: 'La fenêtre de connexion a été bloquée : autorise les pop-ups.'
        };
        toast(msgs[err.message] || ('Connexion impossible : ' + err.message));
      });
  }

  /* ---------------- rendu asynchrone ---------------- */

  function paint(token, html) {
    if (token !== current.token) { return false; }
    main.innerHTML = html;
    return true;
  }

  function fail(token, err) {
    if (token !== current.token) { return; }
    main.innerHTML = errorHtml(err) + (Catalog.mode() === 'yt' ? '' : onboardingHtml());
  }

  /* ---------------- vues ---------------- */

  function viewHome(token) {
    main.innerHTML = '<div class="chips" id="chips"></div>' + onboardingHtml() + skeletonHtml(9);

    Catalog.chips().then(function (chips) {
      if (token !== current.token) { return; }
      var el = $('#chips');
      if (!el) { return; }
      el.innerHTML = chips.map(function (c) {
        return '<button class="chip" data-action="filter" data-value="' + esc(c.id) +
          '" aria-pressed="' + (String(c.id) === String(current.filter)) + '">' +
          esc(c.title) + '</button>';
      }).join('');
    });

    Catalog.home(current.filter).then(function (list) {
      if (token !== current.token) { return; }
      var body = gridHtml(list, { empty: 'Aucune vidéo dans cette catégorie.' });
      var chipsEl = $('#chips');
      main.innerHTML = '<div class="chips" id="chips">' + (chipsEl ? chipsEl.innerHTML : '') + '</div>' +
        onboardingHtml() + body;
    }).catch(function (err) { fail(token, err); });
  }

  function viewTrending(token) {
    main.innerHTML = '<div class="page-head"><h1>Tendances</h1></div>' + skeletonHtml(6);
    Catalog.trending().then(function (list) {
      paint(token, '<div class="page-head"><h1>Tendances</h1></div>' +
        rowsHtml(list.slice(0, 25), { ranked: true, empty: 'Aucune tendance disponible.' }));
    }).catch(function (err) { fail(token, err); });
  }

  function viewSubs(token) {
    main.innerHTML = '<div class="page-head"><h1>Abonnements</h1></div>' + skeletonHtml(6);
    if (!Store.state.subs.length && !Auth.isSignedIn()) {
      paint(token, '<div class="page-head"><h1>Abonnements</h1></div>' +
        emptyHtml('Abonne-toi à une chaîne, ou connecte-toi à ton compte Google, ' +
          'pour retrouver ici les dernières vidéos de tes chaînes.'));
      return;
    }
    Catalog.subsFeed().then(function (list) {
      paint(token, '<div class="page-head"><h1>Abonnements</h1></div>' +
        gridHtml(list, { empty: 'Pas de nouvelle vidéo.' }));
    }).catch(function (err) { fail(token, err); });
  }

  function viewSearch(token, q) {
    main.innerHTML = '<div class="page-head"><h1>' + esc(q) + '</h1></div>' + skeletonHtml(6);
    Catalog.search(q).then(function (r) {
      var head = '<div class="page-head"><h1>' + esc(q) + '</h1><p class="card-meta">' +
        r.videos.length + ' résultat' + (r.videos.length > 1 ? 's' : '') + '</p></div>';
      var chans = r.channels.length ? '<div class="grid">' + r.channels.map(function (c) {
        return '<article class="card"><a class="card-body" href="#/channel/' + esc(c.id) + '">' +
          avatarHtml(c.name, c.hue, c.avatar) + '<div><h3 class="card-title">' + esc(c.name) + '</h3>' +
          '<p class="card-meta">' + subsLabel(c.subs) + '</p></div></a>' +
          '<button class="pill ' + (Store.isSubscribed(c.id) ? '' : 'solid') +
          '" data-action="sub" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) +
          '" data-avatar="' + esc(c.avatar || '') + '">' +
          (Store.isSubscribed(c.id) ? 'Abonné' : "S'abonner") + '</button></article>';
      }).join('') + '</div><h2 class="section-title">Vidéos</h2>' : '';
      paint(token, head + chans + rowsHtml(r.videos, { empty: 'Aucun résultat pour « ' + q + ' ».' }));
    }).catch(function (err) { fail(token, err); });
  }

  function viewChannel(token, id) {
    main.innerHTML = skeletonHtml(6);
    Catalog.channel(id).then(function (r) {
      if (token !== current.token) { return; }
      var ch = r.channel;
      if (!ch) { main.innerHTML = emptyHtml('Chaîne introuvable.'); return; }
      Store.rememberChannel(ch.id, ch.name, ch.avatar);
      var subbed = Store.isSubscribed(ch.id);
      var videos = r.videos;
      var body;
      if (current.tab === 'about') {
        body = '<div class="description open"><pre>' + esc(ch.about || 'Pas de description.') +
          '\n\n' + subsLabel(ch.subs) + (ch.videoCount ? ' • ' + nf(ch.videoCount) + ' vidéos' : '') +
          '</pre></div>';
      } else {
        body = gridHtml(videos, { hideChannel: true, empty: 'Aucune vidéo longue sur cette chaîne.' });
      }

      main.innerHTML = (ch.banner
        ? '<div class="banner-img" style="background-image:url(' + esc(ch.banner) + '=w1707)"></div>'
        : '<div class="banner" style="background:linear-gradient(120deg,hsl(' + (ch.hue || 258) +
          ' 60% 34%),hsl(' + (((ch.hue || 258) + 60) % 360) + ' 55% 22%))"></div>') +
        '<div class="channel-head">' + avatarHtml(ch.name, ch.hue, ch.avatar) +
        '<div><h1>' + esc(ch.name) + '</h1><p class="card-meta">' + subsLabel(ch.subs) +
        (ch.videoCount ? ' • ' + nf(ch.videoCount) + ' vidéos' : '') + '</p>' +
        '<p class="card-meta">' + esc((ch.about || '').split('\n')[0].slice(0, 120)) + '</p></div>' +
        '<button class="pill ' + (subbed ? '' : 'solid') + '" data-action="sub" data-id="' +
        esc(ch.id) + '" data-name="' + esc(ch.name) + '" data-avatar="' + esc(ch.avatar || '') + '">' +
        (subbed ? 'Abonné' : "S'abonner") + '</button></div>' +
        '<div class="tabs" role="tablist">' +
        [['videos', 'Vidéos'], ['about', 'À propos']].map(function (t) {
          return '<button role="tab" data-action="tab" data-value="' + t[0] + '" aria-selected="' +
            (current.tab === t[0]) + '">' + t[1] + '</button>';
        }).join('') + '</div>' + body;
    }).catch(function (err) { fail(token, err); });
  }

  function commentHtml(videoId, c) {
    var liked = Store.isCommentLiked(c.id);
    var likes = c.likes + (liked ? 1 : 0);
    return '<div class="comment">' +
      avatarHtml(c.author, (c.author || '?').charCodeAt(0) * 7 % 360, c.avatar) +
      '<div><p class="who">' + esc(c.author) + '<span>' + ago(c.published) + '</span></p>' +
      '<p class="text">' + esc(c.text) + '</p>' +
      '<div class="tools"><button data-action="like-comment" data-id="' + esc(c.id) +
      '" aria-pressed="' + liked + '" aria-label="J\'aime ce commentaire">' +
      '<svg viewBox="0 0 24 24"><path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/>' +
      '</svg></button><span>' + (likes ? compact(likes) : '') + '</span>' +
      (c.mine ? '<button data-action="del-comment" data-video="' + esc(videoId) + '" data-id="' +
        esc(c.id) + '" aria-label="Supprimer"><svg viewBox="0 0 24 24">' +
        '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>' : '') + '</div>' +
      (c.replies && c.replies.length
        ? '<div class="replies">' + c.replies.map(function (r) { return commentHtml(videoId, r); }).join('') + '</div>'
        : '') + '</div></div>';
  }

  function viewWatch(token, params) {
    main.innerHTML = '<div class="watch"><div class="watch-main">' +
      '<div class="player-wrap" id="player-slot"></div><div class="sk-line" style="margin-top:16px"></div>' +
      '</div><aside class="up-next">' + skeletonHtml(1) + '</aside></div>';

    Catalog.video(params.v).then(function (video) {
      if (token !== current.token) { return; }
      if (!video) { main.innerHTML = emptyHtml('Vidéo introuvable.'); return; }

      var liked = Store.isLiked(video.id);
      var disliked = Store.isDisliked(video.id);
      var saved = Store.inWatchLater(video.id);
      var subbed = video.channelId && Store.isSubscribed(video.channelId);
      var ytUrl = 'https://www.youtube.com/watch?v=' + video.id;

      main.innerHTML = '<div class="watch"><div class="watch-main">' +
        '<div class="player-wrap" id="player-slot"></div>' +
        '<h1>' + esc(video.title) + '</h1>' +
        '<div class="watch-actions"><div class="channel-row">' +
        channelLink(video, channelAvatar(video)) +
        '<div>' + channelLink(video, '<span class="name">' + esc(video.channelTitle) + '</span>') +
        '<div class="subs">' + (video.channelSubs ? subsLabel(video.channelSubs) : '') + '</div></div>' +
        (video.channelId
          ? '<button class="pill ' + (subbed ? '' : 'solid') + '" data-action="sub" data-id="' +
            esc(video.channelId) + '" data-name="' + esc(video.channelTitle) + '">' +
            (subbed ? 'Abonné' : "S'abonner") + '</button>'
          : '') +
        '</div><div class="actions-right"><div class="pill-group">' +
        '<button class="pill" data-action="like" data-id="' + esc(video.id) + '" aria-pressed="' + liked + '">' +
        '<svg viewBox="0 0 24 24"><path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/>' +
        '<path d="M4 10h3v10H4z"/></svg>' + compact((video.likes || 0) + (liked ? 1 : 0)) + '</button>' +
        '<button class="pill" data-action="dislike" data-id="' + esc(video.id) + '" aria-pressed="' +
        disliked + '" aria-label="Je n\'aime pas"><svg viewBox="0 0 24 24" style="transform:rotate(180deg)">' +
        '<path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/>' +
        '<path d="M4 10h3v10H4z"/></svg></button></div>' +
        '<button class="pill" data-action="share" data-id="' + esc(video.id) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M4 12v7h16v-7M12 16V3M8 7l4-4 4 4"/></svg>Partager</button>' +
        '<button class="pill" data-action="save" data-id="' + esc(video.id) + '" aria-pressed="' + saved + '">' +
        '<svg viewBox="0 0 24 24"><path d="M5 4h14v17l-7-5-7 5z"/></svg>Enregistrer</button>' +
        (video.source === 'demo' ? '' : '<a class="pill" href="' + ytUrl +
          '" target="_blank" rel="noopener">YouTube ↗</a>') +
        '</div></div>' +
        '<div class="description" data-action="toggle-desc"><div class="stats">' +
        [views(video.views), video.published ? fullDate(video.published) : ''].filter(Boolean).join(' • ') +
        '</div><pre>' + esc(video.description || 'Pas de description.') + '</pre>' +
        '<span class="more">Afficher plus</span></div>' +
        '<section class="comments" id="comments"><h2>Commentaires</h2>' +
        '<form class="comment-form" data-action="add-comment" data-id="' + esc(video.id) + '">' +
        '<span class="avatar">M</span>' +
        '<input name="text" placeholder="Note personnelle sur cette vidéo…" ' +
        'aria-label="Ajouter une note" maxlength="500">' +
        '<button class="pill solid" type="submit">Ajouter</button></form>' +
        '<div id="comment-list">' + skeletonHtml(1) + '</div></section>' +
        '</div><aside class="up-next"><div class="up-next-head"><h2>' +
        (params.list ? 'File d’attente' : 'Suggestions') + '</h2>' +
        '<label class="switch"><input type="checkbox" data-action="autoplay"' +
        (Store.state.autoplay ? ' checked' : '') + '>Lecture auto</label></div>' +
        '<div id="up-next-list">' + skeletonHtml(1) + '</div></aside></div>';

      Store.watch(video.id);
      current.videoId = video.id;
      current.listId = params.list || null;
      mountPlayer(video);
      renderSidebar();

      var queue = params.list
        ? Catalog.byIds((Store.playlist(params.list) || { videoIds: [] }).videoIds)
        : Catalog.related(video);

      queue.then(function (list) {
        if (token !== current.token) { return; }
        list = list.filter(function (v) { return v.id !== video.id; }).slice(0, 15);
        current.queue = list.map(function (v) { return v.id; });
        var el = $('#up-next-list');
        if (el) {
          el.innerHTML = list.length
            ? list.map(function (v) { return miniCardHtml(v, current.listId); }).join('')
            : '<p class="card-meta">Aucune suggestion.</p>';
        }
      }).catch(function () {
        var el = $('#up-next-list');
        if (el) { el.innerHTML = '<p class="card-meta">Suggestions indisponibles.</p>'; }
      });

      Catalog.comments(video.id).then(function (list) {
        if (token !== current.token) { return; }
        var mine = (Store.state.comments[video.id] || []);
        var all = mine.concat(list);
        var head = $('#comments h2');
        if (head) {
          head.textContent = all.length ? nf(all.length) + ' commentaire' + (all.length > 1 ? 's' : '')
            : 'Commentaires';
        }
        var el = $('#comment-list');
        if (el) {
          el.innerHTML = all.length
            ? all.map(function (c) { return commentHtml(video.id, c); }).join('')
            : '<p class="card-meta">Aucun commentaire.</p>';
        }
      }).catch(function () {
        var el = $('#comment-list');
        if (el) { el.innerHTML = '<p class="card-meta">Commentaires indisponibles.</p>'; }
      });
    }).catch(function (err) { fail(token, err); });
  }

  function viewListPage(token, title, idsPromise, opts) {
    opts = opts || {};
    main.innerHTML = '<div class="page-head"><h1>' + esc(title) + '</h1>' + (opts.actions || '') +
      '</div>' + skeletonHtml(4);
    idsPromise.then(function (list) {
      paint(token, '<div class="page-head"><h1>' + esc(title) + '</h1>' + (opts.actions || '') +
        '</div>' + rowsHtml(list, { remove: opts.remove, list: opts.list, empty: opts.empty }));
    }).catch(function (err) { fail(token, err); });
  }

  function viewPlaylists(token) {
    main.innerHTML = '<div class="page-head"><h1>Playlists</h1>' +
      '<button class="pill solid" data-action="new-playlist">+ Nouvelle playlist</button></div>' +
      skeletonHtml(4);
    Catalog.playlists().then(function (list) {
      var cards = list.map(function (pl) {
        return '<article class="card"><a class="thumb" href="#/playlist/' + esc(pl.id) + '">' +
          (pl.thumb ? '<img src="' + esc(pl.thumb) + '" alt="" data-name="' + esc(pl.name) + '">'
            : '<div class="poster" style="background:linear-gradient(135deg,#3a3a4e,#1d1d28)">' +
              '<span class="who">' + esc(pl.name) + '</span></div>') +
          '<span class="time">' + pl.count + ' vidéo' + (pl.count > 1 ? 's' : '') + '</span></a>' +
          '<div class="card-body"><div><h3 class="card-title"><a href="#/playlist/' + esc(pl.id) +
          '">' + esc(pl.name) + '</a></h3><p class="card-meta">' +
          (pl.remote ? 'Playlist YouTube' : 'Playlist locale') + '</p></div></div>' +
          (pl.remote ? '' : '<button class="icon-btn card-menu" data-action="del-playlist" data-id="' +
            esc(pl.id) + '" aria-label="Supprimer la playlist"><svg viewBox="0 0 24 24">' +
            '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>') + '</article>';
      }).join('');
      paint(token, '<div class="page-head"><h1>Playlists</h1>' +
        '<button class="pill solid" data-action="new-playlist">+ Nouvelle playlist</button></div>' +
        (list.length ? '<div class="grid">' + cards + '</div>'
          : emptyHtml('Aucune playlist. Utilise « Enregistrer » sur une vidéo.')));
    }).catch(function (err) { fail(token, err); });
  }

  function viewPlaylistsLegacy(token) {
    var pls = Store.state.playlists;
    var cards = pls.map(function (pl) {
      return '<article class="card"><a class="thumb" href="#/playlist/' + pl.id + '">' +
        (pl.videoIds.length && Store.state.linkMeta[pl.videoIds[0]]
          ? '<img src="' + esc(Store.state.linkMeta[pl.videoIds[0]].thumb) + '" alt="">'
          : '<div class="poster" style="background:linear-gradient(135deg,#3a3a4e,#1d1d28)">' +
            '<span class="who">' + esc(pl.name) + '</span></div>') +
        '<span class="time">' + pl.videoIds.length + ' vidéo' + (pl.videoIds.length > 1 ? 's' : '') +
        '</span></a><div class="card-body"><div><h3 class="card-title">' +
        '<a href="#/playlist/' + pl.id + '">' + esc(pl.name) + '</a></h3>' +
        '<p class="card-meta">Créée ' + ago(pl.createdAt) + '</p></div></div>' +
        '<button class="icon-btn card-menu" data-action="del-playlist" data-id="' + pl.id +
        '" aria-label="Supprimer la playlist"><svg viewBox="0 0 24 24">' +
        '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button></article>';
    }).join('');
    paint(token, '<div class="page-head"><h1>Playlists</h1>' +
      '<button class="pill solid" data-action="new-playlist">+ Nouvelle playlist</button></div>' +
      (pls.length ? '<div class="grid">' + cards + '</div>'
        : emptyHtml('Aucune playlist. Utilise « Enregistrer » sur une vidéo.')));
  }

  /* Dose quotidienne de formats courts : une seule porte, un minuteur visible,
     pas de défilement infini — on passe à la suivante en le demandant. */
  var shortsSession = { list: [], index: 0, ticker: 0 };

  function stopShortsTicker() {
    clearInterval(shortsSession.ticker);
    shortsSession.ticker = 0;
  }

  function shortsClock() {
    var left = Store.shortsLeft();
    var el = $('#shorts-left');
    if (el) {
      el.textContent = clock(left);
      el.classList.toggle('low', left <= 60);
    }
    return left;
  }

  function endShorts(message) {
    stopShortsTicker();
    Player.stop();
    mini.hidden = true;
    main.innerHTML = '<div class="shorts-page"><div class="empty">' +
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
      '<h2>' + esc(message) + '</h2>' +
      '<p>Le compteur repart demain. En attendant, il y a tout le reste.</p>' +
      '<a class="pill accent" href="#/">Retour à l’accueil</a></div></div>';
  }

  function playShort(index) {
    var v = shortsSession.list[index];
    if (!v) { endShorts('Plus de vidéos courtes pour aujourd’hui'); return; }
    shortsSession.index = index;
    var slot = $('#shorts-slot');
    if (!slot) { return; }
    Store.watch(v.id);
    Player.mount(slot, v, { autoplay: true, dock: $('#mini-slot'), onMini: miniHandler(v) });
    var title = $('#shorts-title');
    if (title) { title.textContent = v.title; }
    var chan = $('#shorts-channel');
    if (chan) { chan.textContent = v.channelTitle || ''; }
    var pos = $('#shorts-pos');
    if (pos) { pos.textContent = (index + 1) + ' / ' + shortsSession.list.length; }
  }

  function startShortsTicker() {
    stopShortsTicker();
    shortsSession.ticker = setInterval(function () {
      if (!document.getElementById('shorts-slot')) { stopShortsTicker(); return; }
      if (!Player.isPlaying()) { return; }
      Store.spendShorts(1);
      if (shortsClock() <= 0) { endShorts('Temps écoulé pour aujourd’hui'); }
    }, 1000);
  }

  function viewShorts(token) {
    var budget = Store.state.shortsBudgetMin || 0;
    if (!budget) {
      paint(token, '<div class="page-head"><h1>Pause courte</h1></div>' +
        emptyHtml('Les vidéos courtes sont désactivées. Un adulte peut en autoriser ' +
          'quelques minutes par jour dans les paramètres.'));
      return;
    }
    var left = Store.shortsLeft();
    if (left <= 0) { endShorts('Temps écoulé pour aujourd’hui'); return; }

    main.innerHTML = '<div class="shorts-page"><div class="shorts-intro">' +
      '<h1>Pause courte</h1>' +
      '<p class="shorts-budget">Il te reste <strong>' + clock(left) + '</strong> aujourd’hui, ' +
      'sur ' + budget + ' minutes.</p>' +
      '<p class="card-meta">Une vidéo à la fois : tu passes à la suivante quand tu le décides. ' +
      'Le minuteur ne tourne que pendant la lecture.</p>' +
      '<button class="pill accent" data-action="shorts-start">Commencer</button>' +
      '<a class="pill" href="#/">Revenir aux vidéos longues</a></div></div>';
  }

  function viewShortsPlayer(token) {
    main.innerHTML = '<div class="shorts-page"><div class="shorts-stage">' +
      '<div class="shorts-frame" id="shorts-slot"></div>' +
      '<div class="shorts-side">' +
      '<div class="shorts-timer">Temps restant <span id="shorts-left">' +
      clock(Store.shortsLeft()) + '</span></div>' +
      '<p class="shorts-title" id="shorts-title">Chargement…</p>' +
      '<p class="card-meta" id="shorts-channel"></p>' +
      '<p class="card-meta" id="shorts-pos"></p>' +
      '<button class="pill solid" data-action="shorts-next">Suivante</button>' +
      '<a class="pill" href="#/" data-action="shorts-quit">J’arrête</a>' +
      '</div></div></div>';

    Catalog.shorts().then(function (list) {
      if (token !== current.token) { return; }
      shortsSession.list = list.slice(0, 20);
      if (!shortsSession.list.length) {
        endShorts('Aucune vidéo courte trouvée');
        return;
      }
      playShort(0);
      startShortsTicker();
    }).catch(function (err) { fail(token, err); });
  }

  function viewSettings(token) {
    var st = Store.state;
    var modeLabel = { yt: 'YouTube (API officielle)', links: 'Liens ajoutés à la main', demo: 'Démo locale' };
    var source = Auth.isSignedIn() ? 'compte connecté'
      : (st.ytKey ? 'clé de cet appareil' : (Ytb.hasServerKey() ? 'clé du serveur' : 'aucune'));
    paint(token, '<div class="page-head"><h1>Paramètres</h1></div><div class="rows">' +

      '<div class="description open"><div class="stats">Compte Google — ' +
      (Auth.isSignedIn() ? 'connecté' : 'déconnecté') + '</div>' +
      '<p>Connecte-toi pour retrouver <strong>tes abonnements, tes playlists et tes vidéos ' +
      'aimées</strong>. Accès en lecture seule, jeton gardé le temps de la session.</p>' +
      (Auth.isSignedIn() && Auth.profile()
        ? '<p class="card-meta">Connecté en tant que ' + esc(Auth.profile().name) + '</p>' +
          '<div class="modal-actions"><button class="pill" data-action="signout">Se déconnecter</button></div>'
        : '<form data-action="save-account">' +
          '<input type="text" name="clientId" placeholder="ID client OAuth (…apps.googleusercontent.com)" ' +
          'value="' + esc(st.googleClientId) + '" autocomplete="off" spellcheck="false">' +
          '<div class="modal-actions"><button class="pill solid" type="submit">Enregistrer</button>' +
          '<button class="pill accent" type="button" data-action="signin">Se connecter avec Google</button>' +
          '</div></form>' +
          '<p class="card-meta">Console Google Cloud → Identifiants → ID client OAuth → ' +
          'type « Application Web » → ajoute l’adresse du site dans « Origines JavaScript autorisées ». ' +
          'La connexion ne fonctionne pas depuis un fichier local (file://) : héberge la page.</p>') +
      '</div>' +

      '<div class="description open"><div class="stats">Nom affiché</div>' +
      '<form data-action="save-brand"><input type="text" name="brandName" maxlength="28" value="' +
      esc(brand()) + '"><div class="modal-actions">' +
      '<button class="pill solid" type="submit">Renommer</button></div></form>' +
      '<p class="card-meta">Le nom affiché dans l’en-tête et l’onglet du navigateur.</p></div>' +

      '<div class="description open"><div class="stats">Source des vidéos — ' +
      esc(modeLabel[Catalog.mode()]) + ' (' + esc(source) + ')</div>' +
      (Ytb.hasServerKey()
        ? '<p><strong>Une clé est installée sur le serveur</strong> : rien à saisir ici, ' +
          'tous les appareils en profitent. Le champ ci-dessous ne sert qu’à utiliser ' +
          'une autre clé sur cet appareil précis.</p>'
        : '<p>Colle une clé <strong>YouTube Data API v3</strong> (gratuite) pour parcourir ' +
          'et rechercher YouTube. Elle ne vaudra que pour <strong>ce navigateur</strong>.<br>' +
          'Pour n’avoir à la saisir qu’une seule fois, pose-la plutôt sur le serveur : ' +
          'Vercel → le projet → Settings → Environment Variables → nom <code>YT_API_KEY</code>, ' +
          'puis redéploie.</p>') +
      '<form data-action="save-key"><input type="text" name="key" placeholder="AIza…" value="' +
      esc(st.ytKey) + '" autocomplete="off" spellcheck="false">' +
      '<select name="region">' + ['FR', 'BE', 'CH', 'CA', 'US', 'GB', 'DE', 'ES', 'IT'].map(function (r) {
        return '<option value="' + r + '"' + (st.region === r ? ' selected' : '') + '>' + r + '</option>';
      }).join('') + '</select>' +
      '<div class="modal-actions"><button class="pill" type="button" data-action="clear-key">Retirer la clé</button>' +
      '<button class="pill solid" type="submit">Enregistrer</button></div></form>' +
      '<p class="card-meta">Obtenir une clé : console.cloud.google.com → créer un projet → ' +
      'activer « YouTube Data API v3 » → Identifiants → Clé API.</p></div>' +

      '<div class="description open"><div class="stats">Vidéos ajoutées à la main (' +
      (st.links || []).length + ')</div>' +
      '<p>Sans clé API, colle des liens YouTube : ils forment ta bibliothèque.</p>' +
      '<div class="modal-actions"><button class="pill solid" data-action="add-link">+ Ajouter un lien</button>' +
      ((st.links || []).length
        ? '<button class="pill" data-action="clear-links">Tout retirer</button>' : '') +
      '</div></div>' +

      '<div class="description open"><div class="stats">Ce qu’on lui propose</div>' +
      '<p>L’accueil ne reprend pas le classement de YouTube : il part de ces thèmes ' +
      'et des chaînes suivies, puis reclasse selon la qualité (voir le README).</p>' +
      '<form data-action="save-feed">' +
      '<input type="text" name="interests" value="' + esc((st.interests || []).join(', ')) +
      '" placeholder="sciences, animaux, dessin…">' +
      '<select name="baitStrength">' +
      [[0.5, 'Filtre souple'], [1, 'Filtre normal'], [2, 'Filtre strict']].map(function (o) {
        return '<option value="' + o[0] + '"' +
          (String(st.baitStrength) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<div class="modal-actions"><button class="pill solid" type="submit">Enregistrer</button></div>' +
      '</form>' +
      '<p class="card-meta">Thèmes séparés par des virgules. Le filtre fait redescendre ' +
      'les titres qui crient, les « 24 h », les défis et les réactions.</p></div>' +

      '<div class="description open"><div class="stats">Vidéos courtes — dose quotidienne</div>' +
      '<form data-action="save-shorts">' +
      '<input type="number" name="shortsBudgetMin" min="0" max="60" step="1" value="' +
      (st.shortsBudgetMin || 0) + '"><span class="card-meta">minutes par jour (0 = désactivé)</span>' +
      '<div class="modal-actions"><button class="pill solid" type="submit">Enregistrer</button>' +
      '<button class="pill" type="button" data-action="reset-shorts">Remettre le compteur à zéro</button>' +
      '</div></form>' +
      '<p class="card-meta">Reste aujourd’hui : ' + clock(Store.shortsLeft()) + '. ' +
      'Le minuteur ne tourne que pendant la lecture, et il n’y a pas de défilement continu.</p></div>' +

      '<div class="description open"><div class="stats">Code parent</div>' +
      '<p>' + (st.pin ? 'Un code protège cette page.' :
        'Sans code, elle peut tout modifier elle-même (y compris la dose de vidéos courtes).') + '</p>' +
      '<form data-action="save-pin"><input type="password" name="pin" inputmode="numeric" ' +
      'pattern="[0-9]*" maxlength="6" placeholder="' + (st.pin ? 'nouveau code' : 'code à 4 chiffres') +
      '"><div class="modal-actions">' +
      (st.pin ? '<button class="pill" type="button" data-action="clear-pin">Retirer le code</button>' : '') +
      '<button class="pill solid" type="submit">Enregistrer</button></div></form></div>' +

      '<div class="description open"><div class="stats">Lecture</div>' +
      '<label class="switch"><input type="checkbox" data-action="autoplay"' +
      (st.autoplay ? ' checked' : '') + '>Lecture automatique de la vidéo suivante</label></div>' +

      '<div class="description open"><div class="stats">Apparence</div>' +
      '<button class="pill" data-action="theme">Basculer en thème ' +
      (document.documentElement.dataset.theme === 'dark' ? 'clair' : 'sombre') + '</button></div>' +

      '<div class="description open"><div class="stats">Données locales</div>' +
      '<pre>' + st.history.length + ' vidéos vues • ' + st.subs.length + ' abonnements • ' +
      st.playlists.length + ' playlists • ' + st.liked.length + ' j’aime</pre>' +
      '<div class="modal-actions">' +
      '<button class="pill" data-action="clear-cache">Vider le cache API</button>' +
      '<button class="pill" data-action="reset">Tout effacer</button></div></div></div>');
  }

  function viewLock(token) {
    paint(token, '<div class="empty"><svg viewBox="0 0 24 24">' +
      '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
      '<h2>Réglages protégés</h2><p>Demande à un adulte.</p>' +
      '<form data-action="unlock" class="lock-form">' +
      '<input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" ' +
      'placeholder="code" autocomplete="off">' +
      '<button class="pill solid" type="submit">Déverrouiller</button></form></div>');
  }

  /* ---------------- lecteur ---------------- */

  function miniHandler(video) {
    return function (on) {
      mini.hidden = !on;
      if (on) {
        $('#mini-title').textContent = video.title;
        $('#mini-channel').textContent = video.channelTitle || '';
      }
    };
  }

  function mountPlayer(video) {
    Player.mount($('#player-slot'), video, {
      autoplay: Store.state.autoplay,
      start: Store.progressOf(video.id),
      dock: $('#mini-slot'),
      onMini: miniHandler(video)
    });
  }

  Player.on('time', function (e) {
    if (e.id) { Store.setProgress(e.id, e.time, e.duration); }
  });

  Player.on('ended', function (video) {
    Store.setProgress(video.id, 0, 0);
    if (!Store.state.autoplay) { return; }
    var next = current.queue.filter(function (id) { return id !== video.id; })[0];
    if (next) { location.hash = '#/watch?v=' + next + (current.listId ? '&list=' + current.listId : ''); }
  });

  /* ---------------- routeur ---------------- */

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('?');
    var params = {};
    (parts[1] || '').split('&').filter(Boolean).forEach(function (kv) {
      var p = kv.split('=');
      params[p[0]] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    return { path: parts[0] || '', params: params };
  }

  function render() {
    var r = parseHash();
    var seg = r.path.split('/');
    var token = ++current.token;

    if (seg[0] !== 'channel') { current.tab = 'videos'; }
    if (seg[0] !== 'watch' && Player.video) { Player.goMini(); }

    switch (seg[0]) {
      case '': case 'home': viewHome(token); break;
      case 'watch': viewWatch(token, r.params); break;
      case 'search':
        $('#search-input').value = r.params.q || '';
        viewSearch(token, r.params.q || '');
        break;
      case 'channel': viewChannel(token, seg[1]); break;
      case 'subs': viewSubs(token); break;
      case 'trending': viewTrending(token); break;
      case 'history':
        viewListPage(token, 'Historique',
          Catalog.byIds(Store.state.history.map(function (h) { return h.id; })),
          { remove: 'rm-history', empty: 'Aucune vidéo regardée.',
            actions: Store.state.history.length
              ? '<button class="pill" data-action="clear-history">Effacer l’historique</button>' : '' });
        break;
      case 'later':
        viewListPage(token, 'À regarder plus tard', Catalog.byIds(Store.state.watchLater),
          { remove: 'rm-later', empty: 'Liste vide. Utilise « Enregistrer » sur une vidéo.' });
        break;
      case 'liked':
        viewListPage(token, "Vidéos que j'aime", Catalog.liked(),
          { remove: Auth.isSignedIn() ? '' : 'rm-liked',
            empty: 'Aucune vidéo likée.' });
        break;
      case 'playlists': viewPlaylists(token); break;
      case 'playlist': {
        var pl = Store.playlist(seg[1]);
        var plName = pl ? pl.name : (r.params.name || 'Playlist');
        viewListPage(token, plName, Catalog.playlistVideos(seg[1]), {
          remove: pl ? 'rm-playlist-video' : '', list: pl ? pl.id : '', empty: 'Playlist vide.'
        });
        break;
      }
      case 'shorts': viewShorts(token); break;
      case 'settings':
        if (Store.state.pin && !current.unlocked) { viewLock(token); }
        else { viewSettings(token); }
        break;
      default: main.innerHTML = emptyHtml('Page introuvable.');
    }

    if (seg[0] !== 'shorts') { stopShortsTicker(); }
    current.path = r.path;
    renderSidebar();
    window.scrollTo(0, 0);
    document.body.classList.remove('drawer');
    $('#scrim').hidden = true;
  }

  /* ---------------- interactions ---------------- */

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { toastEl.hidden = true; }, 2800);
  }

  function openModal(html) {
    $('#modal-body').innerHTML = html;
    if (modal.showModal && !modal.open) { modal.showModal(); } else { modal.setAttribute('open', ''); }
  }

  function closeModal() {
    if (modal.close && modal.open) { modal.close(); } else { modal.removeAttribute('open'); }
  }

  function saveToModal(videoId) {
    openModal('<h2>Enregistrer la vidéo</h2>' +
      '<label><input type="checkbox" data-action="toggle-later" data-id="' + esc(videoId) + '"' +
      (Store.inWatchLater(videoId) ? ' checked' : '') + '> À regarder plus tard</label>' +
      Store.state.playlists.map(function (p) {
        return '<label><input type="checkbox" data-action="toggle-pl" data-pl="' + p.id +
          '" data-id="' + esc(videoId) + '"' + (p.videoIds.indexOf(videoId) !== -1 ? ' checked' : '') +
          '> ' + esc(p.name) + '</label>';
      }).join('') +
      '<input type="text" id="new-pl-name" placeholder="Nouvelle playlist…" maxlength="60">' +
      '<div class="modal-actions"><button class="pill" data-action="create-pl" data-id="' +
      esc(videoId) + '">Créer</button>' +
      '<button class="pill solid" data-action="close-modal">Terminé</button></div>');
  }

  function addLinkModal() {
    openModal('<h2>Ajouter une vidéo YouTube</h2>' +
      '<p class="card-meta">Colle une URL (youtube.com/watch?v=… ou youtu.be/…).</p>' +
      '<input type="text" id="link-url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off">' +
      '<div class="modal-actions"><button class="pill" data-action="close-modal">Annuler</button>' +
      '<button class="pill solid" data-action="do-add-link">Ajouter</button></div>');
    setTimeout(function () { var el = $('#link-url'); if (el) { el.focus(); } }, 50);
  }

  function share(videoId) {
    var url = Catalog.mode() === 'demo'
      ? location.origin + location.pathname + '#/watch?v=' + videoId
      : 'https://youtu.be/' + videoId;
    if (navigator.share) {
      navigator.share({ url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('Lien copié'); },
        function () { toast(url); });
    } else { toast(url); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) { return; }
    var action = el.dataset.action;
    var id = el.dataset.id;

    switch (action) {
      case 'filter':
        current.filter = el.dataset.value;
        viewHome(++current.token);
        return;
      case 'tab':
        current.tab = el.dataset.value;
        viewChannel(++current.token, parseHash().path.split('/')[1]);
        return;
      case 'sub': {
        var added = Store.toggleSub(id);
        if (added) { Store.rememberChannel(id, el.dataset.name || '', el.dataset.avatar || ''); }
        toast(added ? 'Abonnement ajouté' : 'Désabonné');
        render();
        return;
      }
      case 'like':
        toast(Store.like(id) ? 'Ajouté à « Vidéos que j’aime »' : 'J’aime retiré');
        render();
        return;
      case 'dislike': Store.dislike(id); render(); return;
      case 'save': e.preventDefault(); saveToModal(id); return;
      case 'toggle-later':
        Store.toggleWatchLater(id);
        toast(Store.inWatchLater(id) ? 'Ajouté à « À regarder plus tard »' : 'Retiré');
        return;
      case 'toggle-pl': Store.togglePlaylistVideo(el.dataset.pl, id); return;
      case 'create-pl': {
        var name = ($('#new-pl-name') || {}).value;
        if (!name || !name.trim()) { toast('Donne un nom à la playlist'); return; }
        Store.createPlaylist(name.trim(), id);
        toast('Playlist créée');
        saveToModal(id);
        return;
      }
      case 'new-playlist': {
        var n = prompt('Nom de la playlist ?');
        if (n && n.trim()) { Store.createPlaylist(n.trim()); render(); }
        return;
      }
      case 'del-playlist':
        if (confirm('Supprimer cette playlist ?')) { Store.deletePlaylist(id); render(); }
        return;
      case 'rm-playlist-video':
        Store.togglePlaylistVideo(parseHash().path.split('/')[1], id);
        render();
        return;
      case 'share': share(id); closeModal(); return;
      case 'menu': {
        openModal('<h2>Options</h2><div class="modal-actions" ' +
          'style="flex-direction:column;align-items:stretch;gap:8px">' +
          '<button class="pill" data-action="queue-next" data-id="' + esc(id) + '">Lire ensuite</button>' +
          '<button class="pill" data-action="save" data-id="' + esc(id) + '">Enregistrer…</button>' +
          '<button class="pill" data-action="share" data-id="' + esc(id) + '">Partager</button>' +
          '<button class="pill solid" data-action="close-modal">Fermer</button></div>');
        return;
      }
      case 'close-modal': closeModal(); return;
      case 'queue-next':
        current.queue = [id].concat(current.queue.filter(function (q) { return q !== id; }));
        toast('Sera lue ensuite');
        closeModal();
        return;
      case 'rm-history': Store.removeFromHistory(id); render(); return;
      case 'clear-history':
        if (confirm('Effacer tout l’historique ?')) { Store.clearHistory(); render(); }
        return;
      case 'rm-later': Store.toggleWatchLater(id); render(); return;
      case 'rm-liked': Store.like(id); render(); return;
      case 'like-comment': Store.toggleCommentLike(id); render(); return;
      case 'del-comment': Store.deleteComment(el.dataset.video, id); render(); return;
      case 'toggle-desc': {
        el.classList.toggle('open');
        var more = $('.more', el);
        if (more) { more.textContent = el.classList.contains('open') ? 'Afficher moins' : 'Afficher plus'; }
        return;
      }
      case 'theme': toggleTheme(); render(); return;
      case 'add-link': addLinkModal(); return;
      case 'do-add-link': {
        var url = ($('#link-url') || {}).value || '';
        Catalog.addLink(url).then(function (v) {
          toast('Ajouté : ' + v.title);
          closeModal();
          render();
        }).catch(function () { toast('Lien YouTube invalide'); });
        return;
      }
      case 'clear-links':
        if (confirm('Retirer toutes les vidéos ajoutées ?')) {
          Store.set('links', []);
          Store.set('linkMeta', {});
          render();
        }
        return;
      case 'shorts-start': viewShortsPlayer(++current.token); return;
      case 'shorts-next': playShort(shortsSession.index + 1); return;
      case 'shorts-quit': stopShortsTicker(); Player.stop(); mini.hidden = true; return;
      case 'reset-shorts':
        Store.set('shortsUsed', { day: Store.today(), seconds: 0 });
        toast('Compteur remis à zéro');
        render();
        return;
      case 'clear-pin':
        Store.set('pin', '');
        toast('Code retiré');
        render();
        return;
      case 'signin': signIn(); return;
      case 'signout':
        Auth.signOut();
        Store.set('accountSubs', []);
        renderAccount();
        toast('Déconnecté');
        render();
        return;
      case 'clear-key':
        Store.set('ytKey', '');
        Ytb.clearCache();
        toast('Clé retirée');
        render();
        return;
      case 'clear-cache': Ytb.clearCache(); toast('Cache vidé'); return;
      case 'reset':
        if (confirm('Effacer toutes les données locales ?')) {
          Store.reset();
          Ytb.clearCache();
          Player.stop();
          toast('Données effacées');
          render();
        }
        return;
      default: return;
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.dataset.action === 'autoplay') {
      Store.set('autoplay', e.target.checked);
      toast(e.target.checked ? 'Lecture auto activée' : 'Lecture auto désactivée');
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.dataset.action === 'add-comment') {
      e.preventDefault();
      var input = form.querySelector('input');
      if (!input.value.trim()) { return; }
      Store.addComment(form.dataset.id, input.value.trim());
      input.value = '';
      render();
    }
    if (form.dataset.action === 'save-feed') {
      e.preventDefault();
      Store.set('interests', form.interests.value.split(',')
        .map(function (s2) { return s2.trim(); }).filter(Boolean));
      Store.set('baitStrength', parseFloat(form.baitStrength.value));
      Ytb.clearCache();
      toast('Sélection mise à jour');
      render();
    }
    if (form.dataset.action === 'save-shorts') {
      e.preventDefault();
      Store.set('shortsBudgetMin', Math.max(0, Math.min(60, parseInt(form.shortsBudgetMin.value, 10) || 0)));
      toast('Dose quotidienne enregistrée');
      render();
    }
    if (form.dataset.action === 'save-pin') {
      e.preventDefault();
      var code = form.pin.value.trim();
      if (code && !/^[0-9]{4,6}$/.test(code)) { toast('4 à 6 chiffres'); return; }
      Store.set('pin', code);
      current.unlocked = true;
      toast(code ? 'Code enregistré' : 'Code retiré');
      render();
    }
    if (form.dataset.action === 'unlock') {
      e.preventDefault();
      if (form.pin.value.trim() === Store.state.pin) {
        current.unlocked = true;
        render();
      } else {
        toast('Code incorrect');
        form.pin.value = '';
      }
    }
    if (form.dataset.action === 'save-account') {
      e.preventDefault();
      Store.set('googleClientId', form.clientId.value.trim());
      toast('ID client enregistré');
      render();
    }
    if (form.dataset.action === 'save-brand') {
      e.preventDefault();
      Store.set('brandName', form.brandName.value.trim() || 'Céleste');
      applyBrand();
      toast('Renommé');
      render();
    }
    if (form.dataset.action === 'save-key') {
      e.preventDefault();
      Store.set('ytKey', form.key.value.trim());
      Store.set('region', form.region.value);
      Ytb.clearCache();
      toast(form.key.value.trim() ? 'Clé enregistrée — YouTube activé' : 'Clé retirée');
      location.hash = '#/';
      render();
    }
  });

  /* recherche + suggestions */
  var searchForm = $('#search-form');
  var searchInput = $('#search-input');
  var suggestions = $('#suggestions');
  var sugIndex = -1;

  function closeSuggestions() {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    sugIndex = -1;
    searchInput.setAttribute('aria-expanded', 'false');
  }

  function showSuggestions() {
    var q = searchInput.value.trim().toLowerCase();
    var pool = q ? [] : Store.state.searches.slice(0, 6);
    if (q) {
      pool = Store.state.searches.filter(function (s) { return s.toLowerCase().indexOf(q) !== -1; });
      if (Catalog.mode() === 'demo') {
        pool = pool.concat(DB.videos.filter(function (v) {
          return v.title.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 5).map(function (v) { return v.title; }));
      }
    }
    pool = pool.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 8);
    if (!pool.length) { closeSuggestions(); return; }
    suggestions.innerHTML = pool.map(function (s, i) {
      return '<li role="option" data-q="' + esc(s) + '" aria-selected="' + (i === sugIndex) + '">' +
        '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>' +
        esc(s) + '</li>';
    }).join('');
    suggestions.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function go(query) {
    if (!query.trim()) { return; }
    Store.remember(query.trim());
    closeSuggestions();
    searchInput.blur();
    location.hash = '#/search?q=' + encodeURIComponent(query.trim());
  }

  searchInput.addEventListener('input', showSuggestions);
  searchInput.addEventListener('focus', showSuggestions);
  searchInput.addEventListener('keydown', function (e) {
    var items = $$('li', suggestions);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) { return; }
      sugIndex = (sugIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach(function (li, i) { li.setAttribute('aria-selected', i === sugIndex); });
      searchInput.value = items[sugIndex].dataset.q;
    } else if (e.key === 'Escape') { closeSuggestions(); }
  });
  suggestions.addEventListener('mousedown', function (e) {
    var li = e.target.closest('li');
    if (li) { e.preventDefault(); go(li.dataset.q); }
  });
  searchForm.addEventListener('submit', function (e) { e.preventDefault(); go(searchInput.value); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search')) { closeSuggestions(); }
  });

  /* recherche vocale (API navigateur, gratuite ; pratique pour les enfants) */
  var btnVoice = $('#btn-voice');
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btnVoice.hidden = true; } else {
    btnVoice.addEventListener('click', function () {
      var rec = new SR();
      rec.lang = 'fr-FR';
      rec.interimResults = false;
      btnVoice.classList.add('listening');
      rec.onresult = function (e) {
        var said = e.results[0][0].transcript;
        searchInput.value = said;
        go(said);
      };
      rec.onerror = function () { toast('Micro indisponible'); };
      rec.onend = function () { btnVoice.classList.remove('listening'); };
      rec.start();
    });
  }

  /* sidebar + thème + mini-lecteur */
  function isNarrow() { return window.matchMedia('(max-width: 900px)').matches; }

  $('#btn-menu').addEventListener('click', function () {
    if (isNarrow()) {
      var open = document.body.classList.toggle('drawer');
      $('#scrim').hidden = !open;
    } else {
      var rail = document.body.classList.toggle('rail');
      Store.set('sidebarCollapsed', rail);
    }
  });

  $('#scrim').addEventListener('click', function () {
    document.body.classList.remove('drawer');
    $('#scrim').hidden = true;
  });

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    Store.set('theme', next);
  }

  $('#btn-theme').addEventListener('click', toggleTheme);

  $('#btn-notif').addEventListener('click', function () {
    openModal('<h2>Nouveautés de tes abonnements</h2><p class="card-meta">Chargement…</p>');
    Catalog.subsFeed().then(function (list) {
      var fresh = list.filter(function (v) { return Date.now() - v.published < 14 * 86400000; }).slice(0, 6);
      openModal('<h2>Nouveautés</h2>' + (fresh.length
        ? fresh.map(function (v) {
            return '<p><a href="#/watch?v=' + esc(v.id) + '" data-action="close-modal">' +
              esc(v.channelTitle) + ' — ' + esc(v.title) + '</a><br>' +
              '<span class="card-meta">' + ago(v.published) + '</span></p>';
          }).join('')
        : '<p class="card-meta">Rien de neuf. Abonne-toi à des chaînes.</p>') +
        '<div class="modal-actions"><button class="pill solid" data-action="close-modal">Fermer</button></div>');
      Store.set('notifsSeen', Date.now());
    }).catch(function () {
      openModal('<h2>Nouveautés</h2><p class="card-meta">Indisponible hors connexion.</p>' +
        '<div class="modal-actions"><button class="pill solid" data-action="close-modal">Fermer</button></div>');
    });
  });

  $('#btn-account').addEventListener('click', function () {
    var st = Store.state;
    var p = Auth.profile();
    openModal('<h2>' + (Auth.isSignedIn() && p ? esc(p.name) : 'Mon compte') + '</h2>' +
      '<p class="card-meta">' + (Auth.isSignedIn()
        ? 'Connecté à YouTube — ' + (st.accountSubs || []).length + ' abonnements'
        : 'Hors connexion — données locales uniquement') + '</p>' +
      '<p>' + st.liked.length + ' j’aime • ' + st.history.length + ' vidéos vues • ' +
      st.playlists.length + ' playlists locales</p>' +
      '<div class="modal-actions">' +
      (Auth.isSignedIn()
        ? '<button class="pill" data-action="signout">Se déconnecter</button>'
        : '<button class="pill accent" data-action="signin">Se connecter avec Google</button>') +
      '<a class="pill" href="#/settings" data-action="close-modal">Paramètres</a>' +
      '<button class="pill solid" data-action="close-modal">Fermer</button></div>');
  });

  $('#mini-close').addEventListener('click', function () {
    Player.stop();
    mini.hidden = true;
    current.videoId = null;
  });

  $('#mini-expand').addEventListener('click', function () {
    if (Player.video) { location.hash = '#/watch?v=' + Player.video.id; }
  });

  modal.addEventListener('click', function (e) { if (e.target === modal) { closeModal(); } });

  /* raccourcis clavier */
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { return; }
    if (e.key === '/') { e.preventDefault(); searchInput.focus(); return; }
    if (!Player.video) { return; }
    switch (e.key) {
      case ' ': case 'k':
        e.preventDefault();
        if (Player.isPlaying()) { Player.pause(); } else { Player.play(); }
        break;
      case 'ArrowRight': Player.seek(5); break;
      case 'l': Player.seek(10); break;
      case 'ArrowLeft': Player.seek(-5); break;
      case 'j': Player.seek(-10); break;
      case 'm': Player.mute(); break;
      case 'f': Player.fullscreen(); break;
      case '>': toast('Vitesse ' + Player.rate(0.25) + '×'); break;
      case '<': toast('Vitesse ' + Player.rate(-0.25) + '×'); break;
      default: break;
    }
  });

  /* une image absente ne doit pas laisser un trou : on retombe sur le visuel généré */
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallback) { return; }
    img.dataset.fallback = '1';
    var name = img.dataset.name || '';
    var hue = +img.dataset.hue || 258;
    var span = document.createElement('span');
    if (img.classList.contains('avatar')) {
      span.className = 'avatar';
      span.style.background = 'hsl(' + hue + ' 55% 45%)';
      span.textContent = initial(name);
    } else {
      span.className = 'poster';
      span.style.background = 'linear-gradient(135deg,hsl(' + hue + ' 62% 32%),hsl(' +
        ((hue + 42) % 360) + ' 58% 18%))';
      span.innerHTML = '<span class="who">' + esc(name) + '</span>';
    }
    if (img.parentNode) { img.parentNode.replaceChild(span, img); }
  }, true);

  /* ---------------- démarrage ---------------- */

  document.documentElement.dataset.theme = Store.state.theme;
  if (Store.state.sidebarCollapsed) { document.body.classList.add('rail'); }
  applyBrand();
  renderAccount();
  Auth.onChange(renderAccount);
  window.addEventListener('hashchange', render);
  render();
  Ytb.probeServer().then(function (hasKey) {
    if (hasKey && !Store.state.ytKey) { render(); }
  });
  if (Auth.isSignedIn()) { Auth.loadProfile().then(renderAccount).then(syncAccount); }
})();
