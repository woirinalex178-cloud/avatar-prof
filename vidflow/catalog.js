/* Catalogue unifié : même modèle de données quelle que soit la source.
   - mode "yt"    : API YouTube Data v3 (clé gratuite saisie dans Paramètres)
   - mode "liens" : vidéos YouTube ajoutées à la main (métadonnées via oEmbed)
   - mode "demo"  : catalogue local embarqué (aucun réseau) */
(function (global) {
  'use strict';

  function mode() {
    if (Ytb.hasKey()) { return 'yt'; }
    if ((Store.state.links || []).length) { return 'links'; }
    return 'demo';
  }

  function fromDemo(v) {
    var ch = DB.channel(v.channelId);
    return {
      id: v.id, source: 'demo', title: v.title, channelId: v.channelId,
      channelTitle: ch ? ch.name : '', category: v.category, duration: v.duration,
      views: v.views, likes: v.likes, published: v.published, description: v.description,
      thumb: '', hue: v.hue, tags: v.tags
    };
  }

  function demoChannel(id) {
    var c = DB.channel(id);
    if (!c) { return null; }
    return {
      id: c.id, source: 'demo', name: c.name, about: c.about, subs: c.subs,
      avatar: '', banner: '', hue: c.hue, verified: c.verified
    };
  }

  function linkVideos() {
    var ids = Store.state.links || [];
    var meta = Store.state.linkMeta || {};
    return Promise.all(ids.map(function (id) {
      if (meta[id]) { return Promise.resolve(meta[id]); }
      return Ytb.oembed(id).then(function (v) {
        meta[id] = v;
        Store.set('linkMeta', meta);
        return v;
      }).catch(function () {
        return {
          id: id, source: 'yt', title: 'Vidéo ' + id, channelTitle: '', channelId: '',
          duration: 0, views: 0, likes: 0, published: Date.now(), description: '',
          thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', hue: 258
        };
      });
    }));
  }

  function sortByDate(list) {
    return list.slice().sort(function (a, b) { return b.published - a.published; });
  }

  var Catalog = {
    mode: mode,

    /* filtres de la barre de chips : catégories YouTube réelles si clé présente */
    chips: function () {
      if (mode() !== 'yt') {
        return Promise.resolve([{ id: 'all', title: 'Tout' }].concat(
          DB.categories.map(function (c) { return { id: c, title: c }; })));
      }
      return Ytb.categories(Store.state.region).then(function (cats) {
        var keep = ['Musique', 'Jeux vidéo', 'Sport', 'Actualités et politique', 'Science et technologie',
          'Éducation', 'Divertissement', 'Films et animations', 'Auto/Moto', 'Voyages et événements',
          'Animaux', 'Humour', 'Personnes et blogs', 'Howto et style', 'À but non lucratif'];
        var ordered = keep.map(function (name) {
          return cats.filter(function (c) { return c.title === name; })[0];
        }).filter(Boolean);
        return [{ id: 'all', title: 'Tout' }].concat(ordered.length ? ordered : cats);
      }).catch(function () { return [{ id: 'all', title: 'Tout' }]; });
    },

    home: function (filter) {
      var m = mode();
      if (m === 'demo') {
        var list = DB.videos.map(fromDemo);
        if (filter && filter !== 'all') {
          list = list.filter(function (v) { return v.category === filter; });
        }
        return Promise.resolve(sortByDate(list));
      }
      if (m === 'links') { return linkVideos(); }
      if (filter && filter !== 'all') {
        return Ytb.byCategory(filter, Store.state.region);
      }
      var subs = Store.state.subs.filter(function (id) { return /^UC/.test(id); });
      if (!subs.length) { return Ytb.trending(Store.state.region); }
      return Catalog.subsFeed().then(function (feed) {
        return Ytb.trending(Store.state.region).then(function (top) {
          var seen = {};
          return feed.slice(0, 12).concat(top).filter(function (v) {
            if (seen[v.id]) { return false; }
            seen[v.id] = 1;
            return true;
          });
        });
      });
    },

    trending: function () {
      if (mode() === 'yt') { return Ytb.trending(Store.state.region); }
      if (mode() === 'links') { return linkVideos(); }
      return Promise.resolve(DB.videos.map(fromDemo).sort(function (a, b) { return b.views - a.views; }));
    },

    search: function (q) {
      var m = mode();
      if (m === 'yt') {
        return Promise.all([
          Ytb.search(q, { region: Store.state.region }),
          Ytb.searchChannels(q).catch(function () { return []; })
        ]).then(function (r) { return { videos: r[0], channels: r[1] }; });
      }
      var pool = m === 'links' ? linkVideos() : Promise.resolve(DB.videos.map(fromDemo));
      return pool.then(function (list) {
        var norm = function (s) {
          return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        };
        var words = norm(q).split(/\s+/).filter(Boolean);
        var videos = list.filter(function (v) {
          var hay = norm(v.title + ' ' + v.channelTitle + ' ' + (v.category || '') + ' ' + (v.tags || []).join(' '));
          return words.every(function (w) { return hay.indexOf(w) !== -1; });
        });
        var channels = m === 'demo'
          ? DB.channels.filter(function (c) { return norm(c.name).indexOf(norm(q)) !== -1; }).map(function (c) {
              return demoChannel(c.id);
            })
          : [];
        return { videos: videos, channels: channels };
      });
    },

    video: function (id) {
      var m = mode();
      if (m === 'demo') {
        var v = DB.video(id);
        return Promise.resolve(v ? fromDemo(v) : null);
      }
      if (m === 'yt') {
        return Ytb.video(id).catch(function () { return Ytb.oembed(id); });
      }
      return linkVideos().then(function (list) {
        return list.filter(function (v) { return v.id === id; })[0] || Ytb.oembed(id);
      });
    },

    channel: function (id) {
      if (mode() !== 'yt' || !/^UC/.test(id)) {
        var c = demoChannel(id);
        return Promise.resolve({
          channel: c,
          videos: c ? DB.videos.filter(function (v) { return v.channelId === id; }).map(fromDemo) : []
        });
      }
      return Ytb.channels([id]).then(function (list) {
        var ch = list[0];
        if (!ch) { return { channel: null, videos: [] }; }
        return Ytb.channelVideos(ch.uploads).then(function (videos) {
          return { channel: ch, videos: videos };
        });
      });
    },

    related: function (video) {
      if (mode() === 'yt') {
        return Ytb.related(video).catch(function () { return []; });
      }
      if (mode() === 'links') {
        return linkVideos().then(function (list) {
          return list.filter(function (v) { return v.id !== video.id; });
        });
      }
      var all = DB.videos.map(fromDemo);
      return Promise.resolve(all.filter(function (v) { return v.id !== video.id; })
        .map(function (v) {
          var s = (v.channelId === video.channelId ? 6 : 0) +
            (v.category === video.category ? 4 : 0) + v.views / 5e6;
          return { v: v, s: s };
        }).sort(function (a, b) { return b.s - a.s; })
        .map(function (x) { return x.v; }).slice(0, 12));
    },

    comments: function (videoId) {
      if (mode() === 'yt') { return Ytb.comments(videoId).catch(function () { return []; }); }
      var v = DB.video(videoId);
      return Promise.resolve(v ? DB.commentsFor(v) : []);
    },

    subsFeed: function () {
      var subs = Store.state.subs;
      if (!subs.length) { return Promise.resolve([]); }
      if (mode() !== 'yt') {
        return Promise.resolve(sortByDate(DB.videos.filter(function (v) {
          return subs.indexOf(v.channelId) !== -1;
        }).map(fromDemo)));
      }
      return Ytb.channels(subs.filter(function (id) { return /^UC/.test(id); }))
        .then(function (channels) {
          return Promise.all(channels.map(function (c) {
            return Ytb.channelVideos(c.uploads, 10).catch(function () { return []; });
          }));
        })
        .then(function (lists) {
          return sortByDate([].concat.apply([], lists));
        });
    },

    byIds: function (ids) {
      if (!ids.length) { return Promise.resolve([]); }
      if (mode() === 'demo') {
        return Promise.resolve(ids.map(DB.video).filter(Boolean).map(fromDemo));
      }
      if (mode() === 'yt') {
        return Ytb.video(ids[0]) && Promise.all(ids.map(function (id) {
          return Catalog.video(id).catch(function () { return null; });
        })).then(function (l) { return l.filter(Boolean); });
      }
      return Promise.all(ids.map(function (id) {
        return Catalog.video(id).catch(function () { return null; });
      })).then(function (l) { return l.filter(Boolean); });
    },

    addLink: function (input) {
      var id = Ytb.parseId(input);
      if (!id) { return Promise.reject(new Error('url-invalide')); }
      var links = (Store.state.links || []).slice();
      if (links.indexOf(id) === -1) { links.unshift(id); }
      Store.set('links', links);
      return Ytb.oembed(id).then(function (v) {
        var meta = Store.state.linkMeta || {};
        meta[id] = v;
        Store.set('linkMeta', meta);
        return v;
      }).catch(function () { return { id: id, title: 'Vidéo ' + id }; });
    },

    removeLink: function (id) {
      Store.set('links', (Store.state.links || []).filter(function (x) { return x !== id; }));
    }
  };

  global.Catalog = Catalog;
})(window);
