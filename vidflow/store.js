/* État local persistant (localStorage) : abonnements, historique, likes,
   playlists, progression de lecture, préférences. Aucun serveur requis. */
(function (global) {
  'use strict';

  var KEY = 'vidflow.v1';

  var DEFAULTS = {
    theme: 'dark',
    sidebarCollapsed: false,
    autoplay: true,
    subs: [],                 // ids de chaînes
    history: [],              // [{ id, at }] plus récent d'abord
    liked: [],
    disliked: [],
    watchLater: [],
    progress: {},             // videoId -> secondes
    playlists: [],            // [{ id, name, videoIds, createdAt }]
    comments: {},             // videoId -> [commentaires ajoutés]
    commentLikes: [],
    searches: [],
    notifsSeen: 0
  };

  function load() {
    var state;
    try {
      state = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (err) {
      state = {};
    }
    Object.keys(DEFAULTS).forEach(function (k) {
      if (state[k] === undefined) {
        state[k] = Array.isArray(DEFAULTS[k]) ? DEFAULTS[k].slice()
          : (DEFAULTS[k] && typeof DEFAULTS[k] === 'object' ? {} : DEFAULTS[k]);
      }
    });
    return state;
  }

  var state = load();
  var listeners = [];

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      /* quota plein ou mode privé : on continue en mémoire */
    }
    listeners.forEach(function (fn) { fn(state); });
  }

  function toggleIn(list, value) {
    var i = list.indexOf(value);
    if (i === -1) { list.push(value); return true; }
    list.splice(i, 1);
    return false;
  }

  var Store = {
    get state() { return state; },

    onChange: function (fn) { listeners.push(fn); },

    set: function (key, value) { state[key] = value; save(); },

    isSubscribed: function (channelId) { return state.subs.indexOf(channelId) !== -1; },

    toggleSub: function (channelId) {
      var added = toggleIn(state.subs, channelId);
      save();
      return added;
    },

    isLiked: function (id) { return state.liked.indexOf(id) !== -1; },
    isDisliked: function (id) { return state.disliked.indexOf(id) !== -1; },

    like: function (id) {
      var off = state.disliked.indexOf(id);
      if (off !== -1) { state.disliked.splice(off, 1); }
      var added = toggleIn(state.liked, id);
      save();
      return added;
    },

    dislike: function (id) {
      var off = state.liked.indexOf(id);
      if (off !== -1) { state.liked.splice(off, 1); }
      var added = toggleIn(state.disliked, id);
      save();
      return added;
    },

    inWatchLater: function (id) { return state.watchLater.indexOf(id) !== -1; },
    toggleWatchLater: function (id) {
      var added = toggleIn(state.watchLater, id);
      save();
      return added;
    },

    watch: function (id) {
      state.history = state.history.filter(function (h) { return h.id !== id; });
      state.history.unshift({ id: id, at: Date.now() });
      state.history = state.history.slice(0, 200);
      save();
    },

    removeFromHistory: function (id) {
      state.history = state.history.filter(function (h) { return h.id !== id; });
      save();
    },

    clearHistory: function () { state.history = []; save(); },

    setProgress: function (id, seconds, duration) {
      if (!seconds || seconds < 5) { return; }
      if (duration && seconds > duration - 15) { delete state.progress[id]; }
      else { state.progress[id] = Math.round(seconds); }
      save();
    },

    progressOf: function (id) { return state.progress[id] || 0; },

    createPlaylist: function (name, videoId) {
      var pl = {
        id: 'pl-' + Date.now().toString(36),
        name: name,
        videoIds: videoId ? [videoId] : [],
        createdAt: Date.now()
      };
      state.playlists.unshift(pl);
      save();
      return pl;
    },

    playlist: function (id) {
      return state.playlists.filter(function (p) { return p.id === id; })[0] || null;
    },

    togglePlaylistVideo: function (playlistId, videoId) {
      var pl = Store.playlist(playlistId);
      if (!pl) { return false; }
      var added = toggleIn(pl.videoIds, videoId);
      save();
      return added;
    },

    deletePlaylist: function (id) {
      state.playlists = state.playlists.filter(function (p) { return p.id !== id; });
      save();
    },

    addComment: function (videoId, text) {
      var list = state.comments[videoId] || (state.comments[videoId] = []);
      var comment = {
        id: videoId + '-u' + Date.now().toString(36),
        author: 'Moi',
        text: text,
        likes: 0,
        published: Date.now(),
        replies: [],
        mine: true
      };
      list.unshift(comment);
      save();
      return comment;
    },

    deleteComment: function (videoId, commentId) {
      state.comments[videoId] = (state.comments[videoId] || [])
        .filter(function (c) { return c.id !== commentId; });
      save();
    },

    toggleCommentLike: function (commentId) {
      var added = toggleIn(state.commentLikes, commentId);
      save();
      return added;
    },

    isCommentLiked: function (commentId) { return state.commentLikes.indexOf(commentId) !== -1; },

    remember: function (query) {
      if (!query) { return; }
      state.searches = [query].concat(
        state.searches.filter(function (q) { return q !== query; })
      ).slice(0, 12);
      save();
    },

    reset: function () {
      state = JSON.parse(JSON.stringify(DEFAULTS));
      save();
    }
  };

  global.Store = Store;
})(window);
