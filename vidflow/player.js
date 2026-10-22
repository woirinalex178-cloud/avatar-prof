/* Lecteur unique, partagé entre la page vidéo et le mini-lecteur.
   - vidéos YouTube : lecteur iframe officiel (API IFrame, aucune clé requise)
   - catalogue de démo : élément <video> natif
   L'astuce du mini-lecteur : le lecteur vit dans un conteneur fixe que l'on
   superpose au slot courant — déplacer une iframe dans le DOM la rechargerait. */
(function (global) {
  'use strict';

  var host = document.createElement('div');
  host.id = 'player-host';
  host.hidden = true;
  document.body.appendChild(host);

  var videoEl = document.getElementById('player');
  var ytPlayer = null;
  var ytReady = null;
  var state = { video: null, slot: null, dock: null, mini: false, raf: 0, timer: 0 };
  var handlers = { ended: [], time: [] };

  function emit(name, arg) {
    handlers[name].forEach(function (fn) { fn(arg); });
  }

  function loadYtApi() {
    if (ytReady) { return ytReady; }
    ytReady = new Promise(function (resolve, reject) {
      if (global.YT && global.YT.Player) { resolve(global.YT); return; }
      var prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () {
        if (typeof prev === 'function') { prev(); }
        resolve(global.YT);
      };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = function () { reject(new Error('iframe-api-indisponible')); };
      document.head.appendChild(s);
      setTimeout(function () {
        if (!global.YT || !global.YT.Player) { reject(new Error('iframe-api-timeout')); }
      }, 12000);
    });
    return ytReady;
  }

  /* ---- positionnement ---- */

  function topbarHeight() {
    return parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--topbar-h'), 10) || 56;
  }

  function place(rect) {
    host.style.top = rect.top + 'px';
    host.style.left = rect.left + 'px';
    host.style.width = rect.width + 'px';
    host.style.height = rect.height + 'px';
  }

  function sync() {
    state.raf = requestAnimationFrame(sync);
    if (!state.video) { return; }
    var target = state.slot && document.body.contains(state.slot) ? state.slot : null;

    if (target) {
      var r = target.getBoundingClientRect();
      var hidden = r.bottom < topbarHeight() + 8;
      if (hidden !== state.mini) { setMini(hidden); }
    } else if (!state.mini) {
      setMini(true);
    }

    var node = state.mini ? state.dock : state.slot;
    if (!node || !document.body.contains(node)) { return; }
    place(node.getBoundingClientRect());
  }

  function setMini(on) {
    state.mini = on;
    host.classList.toggle('is-mini', on);
    if (state.onMini) { state.onMini(on); }
  }

  /* ---- contrôle ---- */

  function startTicker() {
    clearInterval(state.timer);
    state.timer = setInterval(function () {
      var t = Player.currentTime();
      if (t > 0) { emit('time', { id: state.video && state.video.id, time: t, duration: Player.duration() }); }
    }, 5000);
  }

  function mountYt(video, opts) {
    host.innerHTML = '<div id="yt-target"></div>';
    return loadYtApi().then(function (YT) {
      ytPlayer = new YT.Player('yt-target', {
        videoId: video.id,
        playerVars: {
          autoplay: opts.autoplay ? 1 : 0,
          start: Math.floor(opts.start || 0),
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: location.origin
        },
        events: {
          onStateChange: function (e) {
            if (e.data === 0) { emit('ended', video); }
          },
          onError: function () {
            host.innerHTML = '<div class="player-error">Cette vidéo ne peut pas être lue ici. ' +
              '<a href="https://www.youtube.com/watch?v=' + video.id +
              '" target="_blank" rel="noopener">L’ouvrir sur YouTube</a></div>';
          }
        }
      });
    }).catch(function (err) {
      host.innerHTML = '<div class="player-error">Lecteur YouTube indisponible (' +
        err.message + ').<br><a href="https://www.youtube.com/watch?v=' + video.id +
        '" target="_blank" rel="noopener">Ouvrir sur YouTube</a></div>';
    });
  }

  function mountFile(video, opts) {
    host.innerHTML = '';
    host.appendChild(videoEl);
    if (videoEl.dataset.id !== video.id) {
      videoEl.src = video.src || video.url || '';
      videoEl.dataset.id = video.id;
      videoEl.load();
      if (opts.start) {
        videoEl.addEventListener('loadedmetadata', function once() {
          videoEl.removeEventListener('loadedmetadata', once);
          try { videoEl.currentTime = opts.start; } catch (e) { /* ignore */ }
        });
      }
    }
    if (opts.autoplay) {
      var p = videoEl.play();
      if (p && p.catch) { p.catch(function () { /* autoplay bloqué */ }); }
    }
    return Promise.resolve();
  }

  var Player = {
    get video() { return state.video; },
    get isMini() { return state.mini; },

    mount: function (slot, video, opts) {
      opts = opts || {};
      state.slot = slot;
      state.dock = opts.dock || state.dock;
      state.onMini = opts.onMini || state.onMini;
      host.hidden = false;
      setMini(false);

      var same = state.video && state.video.id === video.id &&
        state.kind === (video.source === 'demo' ? 'file' : 'yt');
      state.video = video;

      if (!same) {
        state.kind = video.source === 'demo' ? 'file' : 'yt';
        if (ytPlayer && state.kind !== 'yt') { try { ytPlayer.destroy(); } catch (e) { /* */ } ytPlayer = null; }
        var mounted = state.kind === 'yt' ? mountYt(video, opts) : mountFile(video, opts);
        startTicker();
        if (state.raf) { cancelAnimationFrame(state.raf); }
        sync();
        return mounted;
      }
      if (state.kind === 'yt' && ytPlayer && ytPlayer.loadVideoById && opts.autoplay) {
        /* même vidéo : on ne recharge pas */
      }
      if (state.raf) { cancelAnimationFrame(state.raf); }
      sync();
      return Promise.resolve();
    },

    stop: function () {
      if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* */ } ytPlayer = null; }
      if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.dataset.id = ''; }
      host.innerHTML = '';
      host.hidden = true;
      state.video = null;
      state.slot = null;
      clearInterval(state.timer);
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
      setMini(false);
    },

    pause: function () {
      if (ytPlayer && ytPlayer.pauseVideo) { ytPlayer.pauseVideo(); }
      if (state.kind === 'file') { videoEl.pause(); }
    },

    play: function () {
      if (ytPlayer && ytPlayer.playVideo) { ytPlayer.playVideo(); }
      if (state.kind === 'file') { videoEl.play().catch(function () {}); }
    },

    isPlaying: function () {
      if (state.kind === 'yt') {
        return !!(ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 1);
      }
      return !!(videoEl.src && !videoEl.paused);
    },

    currentTime: function () {
      if (state.kind === 'yt') {
        return (ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0;
      }
      return videoEl.currentTime || 0;
    },

    duration: function () {
      if (state.kind === 'yt') {
        return (ytPlayer && ytPlayer.getDuration) ? ytPlayer.getDuration() : 0;
      }
      return videoEl.duration || 0;
    },

    seek: function (delta) {
      var t = Math.max(0, Player.currentTime() + delta);
      if (state.kind === 'yt' && ytPlayer && ytPlayer.seekTo) { ytPlayer.seekTo(t, true); }
      else if (state.kind === 'file') { videoEl.currentTime = t; }
    },

    mute: function () {
      if (state.kind === 'yt' && ytPlayer && ytPlayer.isMuted) {
        if (ytPlayer.isMuted()) { ytPlayer.unMute(); } else { ytPlayer.mute(); }
      } else if (state.kind === 'file') { videoEl.muted = !videoEl.muted; }
    },

    rate: function (delta) {
      var r = state.kind === 'yt'
        ? (ytPlayer && ytPlayer.getPlaybackRate ? ytPlayer.getPlaybackRate() : 1)
        : videoEl.playbackRate;
      r = Math.min(2, Math.max(0.25, r + delta));
      if (state.kind === 'yt' && ytPlayer && ytPlayer.setPlaybackRate) { ytPlayer.setPlaybackRate(r); }
      else if (state.kind === 'file') { videoEl.playbackRate = r; }
      return r;
    },

    fullscreen: function () {
      var node = host.firstElementChild || host;
      if (node.requestFullscreen) { node.requestFullscreen().catch(function () {}); }
    },

    setDock: function (dock) { state.dock = dock; },
    goMini: function () { setMini(true); },
    on: function (name, fn) { if (handlers[name]) { handlers[name].push(fn); } }
  };

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { emit('time', { id: state.video && state.video.id,
      time: Player.currentTime(), duration: Player.duration() }); }
  });

  global.Player = Player;
})(window);
