/* Vidflow — routeur + vues. Vanilla JS, aucune dépendance, aucun build. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var main = $('#main');
  var sidebar = $('#sidebar');
  var player = $('#player');
  var mini = $('#miniplayer');
  var toastEl = $('#toast');
  var modal = $('#modal');

  var current = { route: '', videoId: null, queue: [], listId: null, filter: 'Tout', tab: 'videos' };

  /* ---------------- formatage ---------------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nf(n, digits) {
    return n.toLocaleString('fr-FR', { maximumFractionDigits: digits === undefined ? 0 : digits });
  }

  function compact(n) {
    if (n >= 1e9) { return nf(n / 1e9, 1) + ' Md'; }
    if (n >= 1e6) { return nf(n / 1e6, 1) + ' M'; }
    if (n >= 1e3) { return nf(n / 1e3, n >= 1e5 ? 0 : 1) + ' k'; }
    return nf(n);
  }

  function views(n) { return compact(n) + ' vue' + (n > 1 ? 's' : ''); }

  function subsLabel(n) { return compact(n) + ' abonné' + (n > 1 ? 's' : ''); }

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
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(s);
  }

  function fullDate(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------------- fragments ---------------- */

  function initial(name) { return name.trim().charAt(0).toUpperCase(); }

  function avatarHtml(channel, cls) {
    return '<span class="avatar ' + (cls || '') + '" style="background:hsl(' + channel.hue +
      ' 55% 45%)" aria-hidden="true">' + esc(initial(channel.name)) + '</span>';
  }

  function posterHtml(video) {
    var h = video.hue;
    var ch = DB.channel(video.channelId);
    return '<div class="poster" style="background:linear-gradient(135deg,hsl(' + h +
      ' 62% 32%),hsl(' + ((h + 42) % 360) + ' 58% 18%))" aria-hidden="true">' +
      '<svg class="mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/>' +
      '<path d="M10 8.5v7l6-3.5z"/></svg>' +
      '<span class="who">' + esc(ch.name) + '</span>' +
      '<span class="cat">' + esc(video.category) + '</span></div>';
  }

  var VERIFIED = '<svg class="verified" viewBox="0 0 24 24" aria-label="Vérifiée">' +
    '<path d="M12 2.5l2.4 2h3.1l.9 3 2.1 2.3-1.3 2.9.5 3.1-2.9 1.2-1.7 2.6-3.1-.4-2.8 1.4-2-2.4-3-.9-.2-3.1L2 11.3l1.8-2.5.1-3.1 3-1 1.9-2.2z"/>' +
    '<path d="M8.5 12.2l2.4 2.3 4.6-4.9"/></svg>';

  function cardHtml(video, opts) {
    opts = opts || {};
    var ch = DB.channel(video.channelId);
    var prog = Store.progressOf(video.id);
    var bar = prog ? '<span class="bar"><i style="width:' +
      Math.min(100, Math.round(prog / video.duration * 100)) + '%"></i></span>' : '';
    var thumb = '<a class="thumb" href="#/watch?v=' + video.id + (opts.list ? '&list=' + opts.list : '') +
      '" aria-label="' + esc(video.title) + '">' + posterHtml(video) +
      '<span class="time">' + clock(video.duration) + '</span>' + bar + '</a>';
    var channelLine = opts.hideChannel ? '' :
      '<p class="card-meta"><a href="#/channel/' + ch.id + '">' + esc(ch.name) +
      (ch.verified ? ' ' + VERIFIED : '') + '</a></p>';

    return '<article class="card" data-video="' + video.id + '">' + thumb +
      '<div class="card-body">' +
      (opts.hideChannel ? '' : '<a href="#/channel/' + ch.id + '">' + avatarHtml(ch) + '</a>') +
      '<div class="card-text"><h3 class="card-title"><a href="#/watch?v=' + video.id +
      (opts.list ? '&list=' + opts.list : '') + '">' + esc(video.title) + '</a></h3>' +
      channelLine +
      '<p class="card-meta">' + views(video.views) + ' • ' + ago(video.published) + '</p>' +
      '</div></div>' +
      '<button class="icon-btn card-menu" data-action="menu" data-id="' + video.id +
      '" aria-label="Options de la vidéo"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/>' +
      '<circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg></button></article>';
  }

  function miniCardHtml(video, list) {
    var ch = DB.channel(video.channelId);
    var prog = Store.progressOf(video.id);
    var bar = prog ? '<span class="bar"><i style="width:' +
      Math.min(100, Math.round(prog / video.duration * 100)) + '%"></i></span>' : '';
    return '<article class="card mini-card" data-video="' + video.id + '">' +
      '<a class="thumb" href="#/watch?v=' + video.id + (list ? '&list=' + list : '') + '">' +
      posterHtml(video) + '<span class="time">' + clock(video.duration) + '</span>' + bar + '</a>' +
      '<div><h3 class="card-title"><a href="#/watch?v=' + video.id + (list ? '&list=' + list : '') +
      '">' + esc(video.title) + '</a></h3>' +
      '<p class="card-meta">' + esc(ch.name) + '</p>' +
      '<p class="card-meta">' + views(video.views) + ' • ' + ago(video.published) + '</p></div>' +
      '<button class="icon-btn card-menu" data-action="menu" data-id="' + video.id +
      '" aria-label="Options"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/>' +
      '<circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg></button></article>';
  }

  function gridHtml(list, opts) {
    if (!list.length) { return emptyHtml(opts && opts.empty); }
    return '<div class="grid">' + list.map(function (v) { return cardHtml(v, opts); }).join('') + '</div>';
  }

  function emptyHtml(message) {
    return '<div class="empty"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3"/>' +
      '<path d="M10 9.5v5l4.5-2.5z"/></svg><p>' + esc(message || 'Rien à afficher pour le moment.') +
      '</p></div>';
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
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
    channel: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
  };

  function navItem(href, icon, label, count, railHideLabel) {
    var active = location.hash.replace(/^#/, '') === href.replace(/^#/, '');
    return '<a class="nav-item" href="' + href + '"' + (active ? ' aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24">' + icon + '</svg><span' + (railHideLabel ? '' : '') + '>' +
      esc(label) + '</span>' +
      (count ? '<span class="count">' + count + '</span>' : '') + '</a>';
  }

  function renderSidebar() {
    var st = Store.state;
    var subs = st.subs.map(DB.channel).filter(Boolean);

    var html = '<div class="nav-group">' +
      navItem('#/', ICONS.home, 'Accueil') +
      navItem('#/subs', ICONS.subs, 'Abonnements') +
      navItem('#/trending', ICONS.trending, 'Tendances') +
      '</div>' +

      '<div class="nav-group"><h3>Vous</h3>' +
      navItem('#/history', ICONS.history, 'Historique', st.history.length || '') +
      navItem('#/later', ICONS.later, 'À regarder plus tard', st.watchLater.length || '') +
      navItem('#/liked', ICONS.liked, "Vidéos que j'aime", st.liked.length || '') +
      navItem('#/playlists', ICONS.playlist, 'Playlists', st.playlists.length || '') +
      '</div>';

    if (subs.length) {
      html += '<div class="nav-group"><h3>Abonnements</h3>' +
        subs.map(function (c) {
          return '<a class="nav-item" href="#/channel/' + c.id + '">' +
            '<span class="av" style="background:hsl(' + c.hue + ' 55% 45%)">' +
            esc(initial(c.name)) + '</span><span>' + esc(c.name) + '</span></a>';
        }).join('') + '</div>';
    }

    html += '<div class="nav-group"><h3 class="rail-hide">Explorer</h3>' +
      DB.categories.slice(0, 6).map(function (cat) {
        return '<a class="nav-item rail-hide" href="#/search?q=' + encodeURIComponent(cat) + '">' +
          '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>' +
          '<span>' + esc(cat) + '</span></a>';
      }).join('') + '</div>' +

      '<div class="nav-group">' + navItem('#/settings', ICONS.settings, 'Paramètres') + '</div>' +
      '<p class="sidebar-footer">Vidflow — démo locale.<br>Vos données restent dans ce navigateur.</p>';

    sidebar.innerHTML = html;
  }

  /* ---------------- player partagé ---------------- */

  function attachPlayer(container, inPage) {
    container.appendChild(player);
    player.classList.toggle('in-page', !!inPage);
    player.classList.toggle('in-mini', !inPage);
  }

  function loadVideo(video, startAt) {
    if (current.videoId !== video.id) {
      player.src = video.src;
      player.load();
      var at = startAt !== undefined ? startAt : Store.progressOf(video.id);
      if (at) {
        player.addEventListener('loadedmetadata', function once() {
          player.removeEventListener('loadedmetadata', once);
          try { player.currentTime = at; } catch (err) { /* ignore */ }
        });
      }
      current.videoId = video.id;
      Store.watch(video.id);
    }
    if (Store.state.autoplay) {
      var p = player.play();
      if (p && p.catch) { p.catch(function () { /* lecture auto bloquée par le navigateur */ }); }
    }
  }

  function showMini() {
    var v = DB.video(current.videoId);
    if (!v || player.paused || !player.src || player.readyState < 2) { return; }
    attachPlayer($('#mini-slot'), false);
    $('#mini-title').textContent = v.title;
    $('#mini-channel').textContent = DB.channel(v.channelId).name;
    mini.hidden = false;
  }

  function hideMini(stop) {
    mini.hidden = true;
    if (stop) {
      player.pause();
      saveProgress();
      player.removeAttribute('src');
      player.load();
      current.videoId = null;
    }
  }

  function saveProgress() {
    if (current.videoId && player.currentTime) {
      Store.setProgress(current.videoId, player.currentTime, player.duration);
    }
  }

  player.addEventListener('timeupdate', function () {
    if (Math.floor(player.currentTime) % 5 === 0) { saveProgress(); }
  });

  player.addEventListener('ended', function () {
    if (current.videoId) { Store.setProgress(current.videoId, 0, 0); }
    if (!Store.state.autoplay) { return; }
    var next = current.queue.filter(function (id) { return id !== current.videoId; })[0];
    if (next) {
      location.hash = '#/watch?v=' + next + (current.listId ? '&list=' + current.listId : '');
    }
  });

  window.addEventListener('beforeunload', saveProgress);

  /* ---------------- sélections ---------------- */

  function sortByDate(list) {
    return list.slice().sort(function (a, b) { return b.published - a.published; });
  }

  function trending() {
    return DB.videos.slice().sort(function (a, b) {
      var score = function (v) { return v.views / Math.pow((Date.now() - v.published) / 86400000 + 2, 1.2); };
      return score(b) - score(a);
    });
  }

  function related(video) {
    return DB.videos.filter(function (v) { return v.id !== video.id; })
      .map(function (v) {
        var s = 0;
        if (v.channelId === video.channelId) { s += 6; }
        if (v.category === video.category) { s += 4; }
        s += v.tags.filter(function (t) { return video.tags.indexOf(t) !== -1; }).length * 2;
        s += v.views / 5e6;
        return { v: v, s: s };
      })
      .sort(function (a, b) { return b.s - a.s; })
      .map(function (x) { return x.v; });
  }

  function search(query) {
    var q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var words = q.split(/\s+/).filter(Boolean);
    var norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    return DB.videos.map(function (v) {
      var hay = norm(v.title + ' ' + DB.channel(v.channelId).name + ' ' + v.category + ' ' + v.tags.join(' '));
      var hits = words.filter(function (w) { return hay.indexOf(w) !== -1; }).length;
      return { v: v, hits: hits };
    }).filter(function (x) { return x.hits === words.length && words.length; })
      .sort(function (a, b) { return b.v.views - a.v.views; })
      .map(function (x) { return x.v; });
  }

  function byId(ids) {
    return ids.map(DB.video).filter(Boolean);
  }

  /* ---------------- vues ---------------- */

  function viewHome() {
    var chips = ['Tout'].concat(DB.categories);
    var list = current.filter === 'Tout' ? trending() :
      sortByDate(DB.videos.filter(function (v) { return v.category === current.filter; }));
    var resume = byId(Store.state.history.map(function (h) { return h.id; }))
      .filter(function (v) { return Store.progressOf(v.id) > 10; }).slice(0, 4);

    main.innerHTML = '<div class="chips" role="group" aria-label="Filtres">' +
      chips.map(function (c) {
        return '<button class="chip" data-action="filter" data-value="' + esc(c) + '" aria-pressed="' +
          (c === current.filter) + '">' + esc(c) + '</button>';
      }).join('') + '</div>' +
      (resume.length && current.filter === 'Tout'
        ? '<h2 class="section-title">Reprendre la lecture</h2>' + gridHtml(resume) +
          '<h2 class="section-title">Recommandées</h2>'
        : '') +
      gridHtml(list, { empty: 'Aucune vidéo dans cette catégorie.' });
  }

  function viewTrending() {
    main.innerHTML = '<div class="page-head"><h1>Tendances</h1></div>' +
      '<div class="rows">' + trending().slice(0, 12).map(function (v, i) {
        return rowCardHtml(v, { rank: i + 1 });
      }).join('') + '</div>';
  }

  function rowCardHtml(video, opts) {
    opts = opts || {};
    var ch = DB.channel(video.channelId);
    var prog = Store.progressOf(video.id);
    var bar = prog ? '<span class="bar"><i style="width:' +
      Math.min(100, Math.round(prog / video.duration * 100)) + '%"></i></span>' : '';
    return '<article class="row-card" data-video="' + video.id + '">' +
      '<a class="thumb" href="#/watch?v=' + video.id + (opts.list ? '&list=' + opts.list : '') + '">' +
      posterHtml(video) + '<span class="time">' + clock(video.duration) + '</span>' + bar + '</a>' +
      '<div><h3><a href="#/watch?v=' + video.id + (opts.list ? '&list=' + opts.list : '') + '">' +
      (opts.rank ? esc(opts.rank) + '. ' : '') + esc(video.title) + '</a></h3>' +
      '<p class="card-meta">' + views(video.views) + ' • ' + ago(video.published) + '</p>' +
      '<p class="card-meta"><a href="#/channel/' + ch.id + '">' + esc(ch.name) +
      (ch.verified ? ' ' + VERIFIED : '') + '</a></p>' +
      '<p class="snippet">' + esc(video.description.split('\n')[0]) + '</p></div>' +
      '<div class="tools-col">' +
      (opts.remove
        ? '<button class="icon-btn" data-action="' + opts.remove + '" data-id="' + video.id +
          '" aria-label="Retirer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
        : '<button class="icon-btn" data-action="menu" data-id="' + video.id +
          '" aria-label="Options"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/>' +
          '<circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg></button>') +
      '</div></article>';
  }

  function viewSubs() {
    var subs = Store.state.subs;
    if (!subs.length) {
      main.innerHTML = '<div class="page-head"><h1>Abonnements</h1></div>' +
        emptyHtml("Abonne-toi à une chaîne : ses nouvelles vidéos apparaîtront ici.") +
        '<h2 class="section-title">Chaînes à découvrir</h2>' + channelStripHtml(DB.channels);
      return;
    }
    var list = sortByDate(DB.videos.filter(function (v) { return subs.indexOf(v.channelId) !== -1; }));
    main.innerHTML = '<div class="page-head"><h1>Abonnements</h1></div>' + gridHtml(list);
  }

  function channelStripHtml(channels) {
    return '<div class="grid">' + channels.map(function (c) {
      return '<article class="card"><a href="#/channel/' + c.id + '" class="card-body">' +
        avatarHtml(c) + '<div><h3 class="card-title">' + esc(c.name) +
        (c.verified ? ' ' + VERIFIED : '') + '</h3>' +
        '<p class="card-meta">' + subsLabel(c.subs) + '</p></div></a>' +
        '<button class="pill ' + (Store.isSubscribed(c.id) ? '' : 'solid') +
        '" data-action="sub" data-id="' + c.id + '">' +
        (Store.isSubscribed(c.id) ? 'Abonné' : "S'abonner") + '</button></article>';
    }).join('') + '</div>';
  }

  function viewList(title, videos, opts) {
    opts = opts || {};
    main.innerHTML = '<div class="page-head"><h1>' + esc(title) + '</h1>' +
      (opts.actions || '') + '</div>' +
      (videos.length
        ? '<div class="rows">' + videos.map(function (v) {
            return rowCardHtml(v, { remove: opts.remove, list: opts.listId });
          }).join('') + '</div>'
        : emptyHtml(opts.empty));
  }

  function viewPlaylists() {
    var pls = Store.state.playlists;
    var cards = pls.map(function (pl) {
      var first = byId(pl.videoIds)[0];
      return '<article class="card"><a class="thumb" href="#/playlist/' + pl.id + '">' +
        (first ? posterHtml(first) : '<div class="poster" style="background:var(--bg-hover)">Vide</div>') +
        '<span class="time">' + pl.videoIds.length + ' vidéo' + (pl.videoIds.length > 1 ? 's' : '') +
        '</span></a><div class="card-body"><div><h3 class="card-title">' +
        '<a href="#/playlist/' + pl.id + '">' + esc(pl.name) + '</a></h3>' +
        '<p class="card-meta">Créée ' + ago(pl.createdAt) + '</p></div></div>' +
        '<button class="icon-btn card-menu" data-action="del-playlist" data-id="' + pl.id +
        '" aria-label="Supprimer la playlist"><svg viewBox="0 0 24 24">' +
        '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button></article>';
    }).join('');

    main.innerHTML = '<div class="page-head"><h1>Playlists</h1>' +
      '<button class="pill solid" data-action="new-playlist">+ Nouvelle playlist</button></div>' +
      (pls.length ? '<div class="grid">' + cards + '</div>'
        : emptyHtml('Aucune playlist. Crée-en une depuis le menu « Enregistrer » d’une vidéo.'));
  }

  function viewPlaylist(id) {
    var pl = Store.playlist(id);
    if (!pl) { main.innerHTML = emptyHtml('Playlist introuvable.'); return; }
    var videos = byId(pl.videoIds);
    var total = videos.reduce(function (s, v) { return s + v.duration; }, 0);
    viewList(pl.name, videos, {
      listId: pl.id,
      remove: 'rm-playlist-video',
      empty: 'Playlist vide.',
      actions: '<p class="card-meta">' + videos.length + ' vidéo' + (videos.length > 1 ? 's' : '') +
        ' • ' + clock(total) + '</p>' +
        (videos.length ? '<a class="pill accent" href="#/watch?v=' + videos[0].id + '&list=' + pl.id +
          '">Tout lire</a>' : '')
    });
  }

  function viewSearch(query) {
    var results = search(query);
    var channels = DB.channels.filter(function (c) {
      return c.name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
    });
    main.innerHTML = '<div class="page-head"><h1>' + esc(query) + '</h1>' +
      '<p class="card-meta">' + results.length + ' résultat' + (results.length > 1 ? 's' : '') + '</p></div>' +
      (channels.length ? channelStripHtml(channels) + '<h2 class="section-title">Vidéos</h2>' : '') +
      (results.length
        ? '<div class="rows">' + results.map(function (v) { return rowCardHtml(v); }).join('') + '</div>'
        : emptyHtml('Aucun résultat pour « ' + query + ' ».'));
  }

  function viewChannel(id) {
    var ch = DB.channel(id);
    if (!ch) { main.innerHTML = emptyHtml('Chaîne introuvable.'); return; }
    var videos = sortByDate(DB.videos.filter(function (v) { return v.channelId === id; }));
    var subbed = Store.isSubscribed(id);
    var tab = current.tab;

    var body;
    if (tab === 'about') {
      body = '<div class="description open"><pre>' + esc(ch.about) + '\n\n' +
        subsLabel(ch.subs) + ' • ' + videos.length + ' vidéos • ' +
        views(videos.reduce(function (s, v) { return s + v.views; }, 0)) + ' au total</pre></div>';
    } else if (tab === 'playlists') {
      var cats = {};
      videos.forEach(function (v) { (cats[v.category] = cats[v.category] || []).push(v); });
      body = Object.keys(cats).map(function (cat) {
        return '<h2 class="section-title">' + esc(cat) + '</h2>' + gridHtml(cats[cat], { hideChannel: true });
      }).join('') || emptyHtml('Aucune playlist.');
    } else {
      body = gridHtml(videos, { hideChannel: true });
    }

    main.innerHTML = '<div class="banner" style="background:linear-gradient(120deg,hsl(' + ch.hue +
      ' 60% 34%),hsl(' + ((ch.hue + 60) % 360) + ' 55% 22%))"></div>' +
      '<div class="channel-head">' + avatarHtml(ch) +
      '<div><h1>' + esc(ch.name) + (ch.verified ? ' ' + VERIFIED : '') + '</h1>' +
      '<p class="card-meta">' + subsLabel(ch.subs + (subbed ? 1 : 0)) + ' • ' + videos.length +
      ' vidéos</p><p class="card-meta">' + esc(ch.about.split('.')[0]) + '.</p></div>' +
      '<button class="pill ' + (subbed ? '' : 'solid') + '" data-action="sub" data-id="' + ch.id + '">' +
      (subbed ? 'Abonné' : "S'abonner") + '</button></div>' +
      '<div class="tabs" role="tablist">' +
      [['videos', 'Vidéos'], ['playlists', 'Playlists'], ['about', 'À propos']].map(function (t) {
        return '<button role="tab" data-action="tab" data-value="' + t[0] + '" aria-selected="' +
          (tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div>' + body;
  }

  function commentHtml(videoId, c) {
    var liked = Store.isCommentLiked(c.id);
    var likes = c.likes + (liked ? 1 : 0);
    return '<div class="comment"><span class="avatar" style="background:hsl(' +
      (c.author.charCodeAt(0) * 7 % 360) + ' 45% 42%)">' + esc(initial(c.author)) + '</span>' +
      '<div><p class="who">' + esc(c.author) + '<span>' + ago(c.published) + '</span></p>' +
      '<p class="text">' + esc(c.text) + '</p>' +
      '<div class="tools"><button data-action="like-comment" data-id="' + c.id +
      '" aria-pressed="' + liked + '" aria-label="J\'aime ce commentaire">' +
      '<svg viewBox="0 0 24 24"><path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/>' +
      '</svg></button><span>' + (likes || '') + '</span>' +
      (c.mine ? '<button data-action="del-comment" data-video="' + videoId + '" data-id="' + c.id +
        '" aria-label="Supprimer"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>' +
        '</svg></button>' : '') + '</div>' +
      (c.replies && c.replies.length
        ? '<div class="replies">' + c.replies.map(function (r) { return commentHtml(videoId, r); }).join('') + '</div>'
        : '') +
      '</div></div>';
  }

  function viewWatch(params) {
    var video = DB.video(params.v);
    if (!video) { main.innerHTML = emptyHtml('Vidéo introuvable.'); return; }
    var ch = DB.channel(video.channelId);
    var pl = params.list ? Store.playlist(params.list) : null;
    var queueVideos = pl ? byId(pl.videoIds) : related(video).slice(0, 12);
    current.queue = queueVideos.map(function (v) { return v.id; });
    current.listId = pl ? pl.id : null;

    var liked = Store.isLiked(video.id);
    var disliked = Store.isDisliked(video.id);
    var saved = Store.inWatchLater(video.id);
    var subbed = Store.isSubscribed(video.channelId);
    var comments = (Store.state.comments[video.id] || []).concat(DB.commentsFor(video));

    main.innerHTML = '<div class="watch"><div class="watch-main">' +
      '<div class="player-wrap" id="player-slot"></div>' +
      '<h1>' + esc(video.title) + '</h1>' +
      '<div class="watch-actions"><div class="channel-row">' +
      '<a href="#/channel/' + ch.id + '">' + avatarHtml(ch) + '</a>' +
      '<div><a class="name" href="#/channel/' + ch.id + '">' + esc(ch.name) +
      (ch.verified ? ' ' + VERIFIED : '') + '</a>' +
      '<div class="subs">' + subsLabel(ch.subs + (subbed ? 1 : 0)) + '</div></div>' +
      '<button class="pill ' + (subbed ? '' : 'solid') + '" data-action="sub" data-id="' + ch.id + '">' +
      (subbed ? 'Abonné' : "S'abonner") + '</button></div>' +

      '<div class="actions-right"><div class="pill-group">' +
      '<button class="pill" data-action="like" data-id="' + video.id + '" aria-pressed="' + liked + '">' +
      '<svg viewBox="0 0 24 24"><path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/>' +
      '<path d="M4 10h3v10H4z"/></svg>' + compact(video.likes + (liked ? 1 : 0)) + '</button>' +
      '<button class="pill" data-action="dislike" data-id="' + video.id + '" aria-pressed="' + disliked +
      '" aria-label="Je n\'aime pas"><svg viewBox="0 0 24 24" style="transform:rotate(180deg)">' +
      '<path d="M7 20V10l4-7 1.5 1.2L11 9h6.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 16 20z"/>' +
      '<path d="M4 10h3v10H4z"/></svg></button></div>' +
      '<button class="pill" data-action="share" data-id="' + video.id + '">' +
      '<svg viewBox="0 0 24 24"><path d="M4 12v7h16v-7M12 16V3M8 7l4-4 4 4"/></svg>Partager</button>' +
      '<button class="pill" data-action="save" data-id="' + video.id + '" aria-pressed="' + saved + '">' +
      '<svg viewBox="0 0 24 24"><path d="M5 4h14v17l-7-5-7 5z"/></svg>Enregistrer</button>' +
      '</div></div>' +

      '<div class="description" data-action="toggle-desc"><div class="stats">' +
      views(video.views) + ' • ' + fullDate(video.published) + ' • ' + esc(video.category) + '</div>' +
      '<pre>' + esc(video.description) + '</pre>' +
      '<span class="more">Afficher plus</span></div>' +

      '<section class="comments"><h2>' + nf(comments.length) + ' commentaire' +
      (comments.length > 1 ? 's' : '') + '</h2>' +
      '<form class="comment-form" data-action="add-comment" data-id="' + video.id + '">' +
      '<span class="avatar">M</span>' +
      '<input name="text" placeholder="Ajouter un commentaire…" aria-label="Ajouter un commentaire" maxlength="500">' +
      '<button class="pill solid" type="submit">Commenter</button></form>' +
      comments.map(function (c) { return commentHtml(video.id, c); }).join('') +
      '</section></div>' +

      '<aside class="up-next"><div class="up-next-head"><h2>' +
      (pl ? esc(pl.name) : 'Suggestions') + '</h2>' +
      '<label class="switch"><input type="checkbox" data-action="autoplay"' +
      (Store.state.autoplay ? ' checked' : '') + '>Lecture auto</label></div>' +
      queueVideos.map(function (v) { return miniCardHtml(v, current.listId); }).join('') +
      '</aside></div>';

    hideMini(false);
    attachPlayer($('#player-slot'), true);
    loadVideo(video);
  }

  function viewSettings() {
    var st = Store.state;
    main.innerHTML = '<div class="page-head"><h1>Paramètres</h1></div>' +
      '<div class="rows"><div class="description open"><div class="stats">Lecture</div>' +
      '<label class="switch"><input type="checkbox" data-action="autoplay"' +
      (st.autoplay ? ' checked' : '') + '>Lecture automatique de la vidéo suivante</label></div>' +
      '<div class="description open"><div class="stats">Apparence</div>' +
      '<button class="pill" data-action="theme">Basculer en thème ' +
      (document.documentElement.dataset.theme === 'dark' ? 'clair' : 'sombre') + '</button></div>' +
      '<div class="description open"><div class="stats">Données locales</div>' +
      '<pre>' + st.history.length + ' vidéos dans l’historique • ' + st.subs.length + ' abonnements • ' +
      st.playlists.length + ' playlists • ' + st.liked.length + ' j’aime</pre>' +
      '<div class="modal-actions"><button class="pill" data-action="reset">Tout effacer</button></div>' +
      '</div></div>';
  }

  /* ---------------- routeur ---------------- */

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('?');
    var path = parts[0] || '';
    var params = {};
    (parts[1] || '').split('&').filter(Boolean).forEach(function (kv) {
      var p = kv.split('=');
      params[p[0]] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    return { path: path, params: params };
  }

  function render() {
    var r = parseHash();
    var seg = r.path.split('/');

    if (seg[0] !== 'watch' && current.videoId && !player.paused) { showMini(); }
    if (seg[0] !== 'channel') { current.tab = 'videos'; }

    switch (seg[0]) {
      case '':
      case 'home': viewHome(); break;
      case 'watch': viewWatch(r.params); break;
      case 'search':
        $('#search-input').value = r.params.q || '';
        viewSearch(r.params.q || '');
        break;
      case 'channel': viewChannel(seg[1]); break;
      case 'subs': viewSubs(); break;
      case 'trending': viewTrending(); break;
      case 'history':
        viewList('Historique', byId(Store.state.history.map(function (h) { return h.id; })), {
          remove: 'rm-history',
          empty: 'Aucune vidéo regardée.',
          actions: Store.state.history.length
            ? '<button class="pill" data-action="clear-history">Effacer l’historique</button>' : ''
        });
        break;
      case 'later':
        viewList('À regarder plus tard', byId(Store.state.watchLater), {
          remove: 'rm-later', empty: 'Liste vide. Utilise « Enregistrer » sur une vidéo.'
        });
        break;
      case 'liked':
        viewList("Vidéos que j'aime", byId(Store.state.liked), {
          remove: 'rm-liked', empty: 'Aucune vidéo likée.'
        });
        break;
      case 'playlists': viewPlaylists(); break;
      case 'playlist': viewPlaylist(seg[1]); break;
      case 'settings': viewSettings(); break;
      default: main.innerHTML = emptyHtml('Page introuvable.');
    }

    current.route = r.path;
    renderSidebar();
    if (seg[0] !== 'search') { /* laisse la requête affichée uniquement sur la recherche */ }
    window.scrollTo(0, 0);
    document.body.classList.remove('drawer');
    $('#scrim').hidden = true;
  }

  /* ---------------- interactions ---------------- */

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  function openModal(html) {
    $('#modal-body').innerHTML = html;
    if (modal.showModal) { modal.showModal(); } else { modal.setAttribute('open', ''); }
  }

  function closeModal() {
    if (modal.close) { modal.close(); } else { modal.removeAttribute('open'); }
  }

  function saveToModal(videoId) {
    var pls = Store.state.playlists;
    openModal('<h2>Enregistrer la vidéo</h2>' +
      '<label><input type="checkbox" data-action="toggle-later" data-id="' + videoId + '"' +
      (Store.inWatchLater(videoId) ? ' checked' : '') + '> À regarder plus tard</label>' +
      pls.map(function (p) {
        return '<label><input type="checkbox" data-action="toggle-pl" data-pl="' + p.id +
          '" data-id="' + videoId + '"' +
          (p.videoIds.indexOf(videoId) !== -1 ? ' checked' : '') + '> ' + esc(p.name) + '</label>';
      }).join('') +
      '<input type="text" id="new-pl-name" placeholder="Nouvelle playlist…" maxlength="60">' +
      '<div class="modal-actions">' +
      '<button class="pill" data-action="create-pl" data-id="' + videoId + '">Créer</button>' +
      '<button class="pill solid" data-action="close-modal">Terminé</button></div>');
  }

  function videoMenu(videoId) {
    var v = DB.video(videoId);
    openModal('<h2>' + esc(v.title) + '</h2>' +
      '<div class="modal-actions" style="flex-direction:column;align-items:stretch;gap:8px">' +
      '<button class="pill" data-action="queue-next" data-id="' + videoId + '">Lire ensuite</button>' +
      '<button class="pill" data-action="save" data-id="' + videoId + '">Enregistrer…</button>' +
      '<button class="pill" data-action="share" data-id="' + videoId + '">Partager</button>' +
      '<a class="pill" href="#/channel/' + v.channelId + '" data-action="close-modal">Voir la chaîne</a>' +
      '<button class="pill solid" data-action="close-modal">Fermer</button></div>');
  }

  function share(videoId) {
    var url = location.origin + location.pathname + '#/watch?v=' + videoId;
    if (navigator.share) {
      navigator.share({ title: DB.video(videoId).title, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('Lien copié'); },
        function () { toast(url); });
    } else {
      toast(url);
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) { return; }
    var action = el.dataset.action;
    var id = el.dataset.id;

    switch (action) {
      case 'filter':
        current.filter = el.dataset.value;
        viewHome();
        return;
      case 'tab':
        current.tab = el.dataset.value;
        viewChannel(parseHash().path.split('/')[1]);
        return;
      case 'sub': {
        var added = Store.toggleSub(id);
        toast(added ? 'Abonné à ' + DB.channel(id).name : 'Désabonné');
        render();
        return;
      }
      case 'like':
        toast(Store.like(id) ? 'Ajouté à « Vidéos que j’aime »' : 'J’aime retiré');
        render();
        return;
      case 'dislike':
        Store.dislike(id);
        render();
        return;
      case 'save':
        e.preventDefault();
        saveToModal(id);
        return;
      case 'toggle-later':
        Store.toggleWatchLater(id);
        toast(Store.inWatchLater(id) ? 'Ajouté à « À regarder plus tard »' : 'Retiré');
        return;
      case 'toggle-pl':
        Store.togglePlaylistVideo(el.dataset.pl, id);
        return;
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
      case 'share':
        share(id);
        closeModal();
        return;
      case 'menu':
        videoMenu(id);
        return;
      case 'close-modal':
        closeModal();
        return;
      case 'queue-next':
        current.queue = [id].concat(current.queue.filter(function (q) { return q !== id; }));
        toast('Sera lue ensuite');
        closeModal();
        return;
      case 'rm-history':
        Store.removeFromHistory(id);
        render();
        return;
      case 'clear-history':
        if (confirm('Effacer tout l’historique ?')) { Store.clearHistory(); render(); }
        return;
      case 'rm-later':
        Store.toggleWatchLater(id);
        render();
        return;
      case 'rm-liked':
        Store.like(id);
        render();
        return;
      case 'like-comment':
        Store.toggleCommentLike(id);
        render();
        return;
      case 'del-comment':
        Store.deleteComment(el.dataset.video, id);
        render();
        return;
      case 'toggle-desc':
        el.classList.toggle('open');
        var more = $('.more', el);
        if (more) { more.textContent = el.classList.contains('open') ? 'Afficher moins' : 'Afficher plus'; }
        return;
      case 'theme':
        toggleTheme();
        render();
        return;
      case 'reset':
        if (confirm('Effacer toutes les données locales (abonnements, historique, playlists) ?')) {
          Store.reset();
          toast('Données effacées');
          render();
        }
        return;
      default:
        return;
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
    var pool = [];
    if (!q) {
      pool = Store.state.searches.slice(0, 6);
    } else {
      pool = DB.videos.filter(function (v) { return v.title.toLowerCase().indexOf(q) !== -1; })
        .slice(0, 5).map(function (v) { return v.title; })
        .concat(DB.categories.filter(function (c) { return c.toLowerCase().indexOf(q) !== -1; }))
        .concat(DB.channels.filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; })
          .map(function (c) { return c.name; }));
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
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });
  suggestions.addEventListener('mousedown', function (e) {
    var li = e.target.closest('li');
    if (li) { e.preventDefault(); go(li.dataset.q); }
  });
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    go(searchInput.value);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search')) { closeSuggestions(); }
  });

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
    var subs = Store.state.subs;
    var fresh = sortByDate(DB.videos.filter(function (v) {
      return subs.indexOf(v.channelId) !== -1 && Date.now() - v.published < 7 * 86400000;
    })).slice(0, 5);
    openModal('<h2>Notifications</h2>' +
      (fresh.length
        ? fresh.map(function (v) {
            return '<p><a href="#/watch?v=' + v.id + '" data-action="close-modal">' +
              esc(DB.channel(v.channelId).name) + ' a publié : ' + esc(v.title) + '</a><br>' +
              '<span class="card-meta">' + ago(v.published) + '</span></p>';
          }).join('')
        : '<p class="card-meta">Aucune nouveauté. Abonne-toi à des chaînes pour recevoir des notifications.</p>') +
      '<div class="modal-actions"><button class="pill solid" data-action="close-modal">Fermer</button></div>');
    Store.set('notifsSeen', Date.now());
    refreshNotifBadge();
  });

  $('#btn-account').addEventListener('click', function () {
    var st = Store.state;
    openModal('<h2>Mon compte</h2>' +
      '<p class="card-meta">Profil local « Moi »</p>' +
      '<p>' + st.subs.length + ' abonnements • ' + st.liked.length + ' j’aime • ' +
      st.history.length + ' vidéos vues</p>' +
      '<div class="modal-actions">' +
      '<a class="pill" href="#/settings" data-action="close-modal">Paramètres</a>' +
      '<button class="pill solid" data-action="close-modal">Fermer</button></div>');
  });

  function refreshNotifBadge() {
    var subs = Store.state.subs;
    var n = DB.videos.filter(function (v) {
      return subs.indexOf(v.channelId) !== -1 &&
        v.published > Math.max(Store.state.notifsSeen, Date.now() - 7 * 86400000);
    }).length;
    var badge = $('#notif-count');
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  $('#mini-close').addEventListener('click', function () { hideMini(true); });
  $('#mini-expand').addEventListener('click', function () {
    if (current.videoId) { location.hash = '#/watch?v=' + current.videoId; }
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) { closeModal(); }
  });

  /* raccourcis clavier façon lecteur vidéo */
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { return; }
    if (e.key === '/') { e.preventDefault(); searchInput.focus(); return; }
    if (!player.src || !current.videoId) { return; }
    switch (e.key) {
      case ' ': case 'k':
        e.preventDefault();
        if (player.paused) { player.play(); } else { player.pause(); }
        break;
      case 'ArrowRight': case 'l': player.currentTime += e.key === 'l' ? 10 : 5; break;
      case 'ArrowLeft': case 'j': player.currentTime -= e.key === 'j' ? 10 : 5; break;
      case 'ArrowUp': player.volume = Math.min(1, player.volume + 0.1); break;
      case 'ArrowDown': player.volume = Math.max(0, player.volume - 0.1); break;
      case 'm': player.muted = !player.muted; break;
      case 'f':
        if (player.requestFullscreen) { player.requestFullscreen().catch(function () {}); }
        break;
      case '>': player.playbackRate = Math.min(2, player.playbackRate + 0.25);
        toast('Vitesse ' + player.playbackRate + '×'); break;
      case '<': player.playbackRate = Math.max(0.25, player.playbackRate - 0.25);
        toast('Vitesse ' + player.playbackRate + '×'); break;
      default: break;
    }
  });

  /* ---------------- démarrage ---------------- */

  document.documentElement.dataset.theme = Store.state.theme;
  if (Store.state.sidebarCollapsed) { document.body.classList.add('rail'); }
  window.addEventListener('hashchange', render);
  render();
  refreshNotifBadge();
  Store.onChange(refreshNotifBadge);
})();
