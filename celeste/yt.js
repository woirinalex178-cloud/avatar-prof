/* Accès YouTube : lecteur iframe officiel + API Data v3 (clé gratuite)
   + repli oEmbed sans clé. Aucune vidéo n'est téléchargée ni ré-hébergée. */
(function (global) {
  'use strict';

  var API = 'https://www.googleapis.com/youtube/v3/';
  var CACHE_KEY = 'vidflow.cache.v1';
  var TTL = 30 * 60 * 1000;

  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { cache = {}; }

  function cacheGet(k, ttl) {
    var hit = cache[k];
    if (!hit || Date.now() - hit.t > (ttl || TTL)) { return null; }
    return hit.v;
  }

  function cacheSet(k, v) {
    cache[k] = { t: Date.now(), v: v };
    var keys = Object.keys(cache);
    if (keys.length > 120) {
      keys.sort(function (a, b) { return cache[a].t - cache[b].t; })
        .slice(0, keys.length - 120).forEach(function (old) { delete cache[old]; });
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* quota */ }
  }

  function key() { return (Store.state.ytKey || '').trim(); }

  function token() {
    return (global.Auth && Auth.isSignedIn && Auth.isSignedIn()) ? Auth.token() : '';
  }

  /* "PT1H2M3S" -> 3723 */
  function isoSeconds(iso) {
    var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
    if (!m) { return 0; }
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  function parseId(input) {
    var s = String(input || '').trim();
    if (/^[\w-]{11}$/.test(s)) { return s; }
    var m = s.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  function parseChannel(input) {
    var s = String(input || '').trim();
    if (/^UC[\w-]{22}$/.test(s)) { return { id: s }; }
    var m = s.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    if (m) { return { id: m[1] }; }
    m = s.match(/youtube\.com\/@([\w.-]+)/) || s.match(/^@([\w.-]+)$/);
    if (m) { return { handle: '@' + m[1] }; }
    return null;
  }

  function qs(params) {
    return Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  }

  function api(path, params, opts) {
    opts = opts || {};
    var bearer = token();
    if (!key() && !bearer) {
      var noKey = new Error('no-key');
      noKey.reason = 'no-key';
      return Promise.reject(noKey);
    }
    params = params || {};
    if (key()) { params.key = key(); }
    var url = API + path + '?' + qs(params);
    var ck = 'api:' + path + ':' + qs(Object.assign({}, params, { key: '' })) +
      (opts.mine ? ':me' : '');
    var hit = cacheGet(ck, opts.mine ? 5 * 60 * 1000 : 0);
    if (hit) { return Promise.resolve(hit); }
    return fetch(url, bearer ? { headers: { Authorization: 'Bearer ' + bearer } } : undefined)
      .then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok) {
          var reason = ((json.error || {}).errors || [{}])[0].reason || 'error';
          var err = new Error(reason);
          err.reason = reason;
          err.detail = (json.error || {}).message || '';
          throw err;
        }
        cacheSet(ck, json);
        return json;
      });
    });
  }

  /* ---- normalisation vers le modèle interne ---- */

  function hueOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) % 360; }
    return h;
  }

  function thumbOf(id, snippet) {
    var t = (snippet && snippet.thumbnails) || {};
    var best = t.maxres || t.standard || t.high || t.medium || t.default;
    return best ? best.url : 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
  }

  function mapVideo(item) {
    var id = item.id && item.id.videoId ? item.id.videoId : item.id;
    var s = item.snippet || {};
    var st = item.statistics || {};
    return {
      id: id,
      source: 'yt',
      title: s.title || '',
      channelId: s.channelId || '',
      channelTitle: s.channelTitle || '',
      category: s.categoryId || '',
      duration: isoSeconds((item.contentDetails || {}).duration),
      views: +st.viewCount || 0,
      likes: +st.likeCount || 0,
      comments: +st.commentCount || 0,
      published: Date.parse(s.publishedAt || '') || Date.now(),
      description: s.description || '',
      thumb: thumbOf(id, s),
      hue: hueOf(s.channelId || id),
      live: (s.liveBroadcastContent || 'none') !== 'none'
    };
  }

  function mapChannel(item) {
    var s = item.snippet || {};
    var t = (s.thumbnails || {}).medium || (s.thumbnails || {}).default || {};
    return {
      id: item.id,
      source: 'yt',
      name: s.title || '',
      about: s.description || '',
      subs: +((item.statistics || {}).subscriberCount) || 0,
      videoCount: +((item.statistics || {}).videoCount) || 0,
      avatar: t.url || '',
      banner: ((item.brandingSettings || {}).image || {}).bannerExternalUrl || '',
      uploads: (((item.contentDetails || {}).relatedPlaylists) || {}).uploads || '',
      hue: hueOf(item.id || ''),
      verified: false
    };
  }

  /* ---- un Short = vidéo verticale très courte : on les écarte ---- */
  function isShort(v) {
    if (!v) { return true; }
    if (v.duration && v.duration > 0 && v.duration <= 61) { return true; }
    return /#shorts?\b/i.test(v.title + ' ' + (v.description || '').slice(0, 200));
  }

  function noShorts(list) { return list.filter(function (v) { return !isShort(v); }); }

  /* ---- requêtes de haut niveau ---- */

  function videosByIds(ids) {
    ids = ids.filter(Boolean).slice(0, 50);
    if (!ids.length) { return Promise.resolve([]); }
    return api('videos', {
      part: 'snippet,contentDetails,statistics',
      id: ids.join(',')
    }).then(function (j) { return (j.items || []).map(mapVideo); });
  }

  var Yt = {
    parseId: parseId,
    parseChannel: parseChannel,
    isoSeconds: isoSeconds,
    isShort: isShort,
    noShorts: noShorts,
    mapVideo: mapVideo,
    mapChannel: mapChannel,
    hasKey: function () { return !!key(); },
    clearCache: function () {
      cache = {};
      try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
    },

    /* sans clé : titre + chaîne officiels, via oEmbed (CORS autorisé) */
    oembed: function (id) {
      var ck = 'oembed:' + id;
      var hit = cacheGet(ck);
      if (hit) { return Promise.resolve(hit); }
      return fetch('https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + id))
        .then(function (r) {
          if (!r.ok) { throw new Error('oembed-' + r.status); }
          return r.json();
        })
        .then(function (j) {
          var v = {
            id: id,
            source: 'yt',
            title: j.title || id,
            channelId: '',
            channelTitle: j.author_name || '',
            channelUrl: j.author_url || '',
            duration: 0,
            views: 0,
            likes: 0,
            published: Date.now(),
            description: '',
            thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
            hue: hueOf(j.author_name || id)
          };
          cacheSet(ck, v);
          return v;
        });
    },

    trending: function (region) {
      return api('videos', {
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        regionCode: region || 'FR',
        maxResults: 50
      }).then(function (j) { return noShorts((j.items || []).map(mapVideo)); });
    },

    byCategory: function (categoryId, region) {
      return api('videos', {
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        videoCategoryId: categoryId,
        regionCode: region || 'FR',
        maxResults: 50
      }).then(function (j) { return noShorts((j.items || []).map(mapVideo)); });
    },

    categories: function (region) {
      return api('videoCategories', { part: 'snippet', regionCode: region || 'FR' })
        .then(function (j) {
          return (j.items || []).filter(function (i) { return i.snippet.assignable; })
            .map(function (i) { return { id: i.id, title: i.snippet.title }; });
        });
    },

    search: function (q, opts) {
      opts = opts || {};
      return api('search', {
        part: 'snippet',
        q: q,
        type: 'video',
        maxResults: 25,
        order: opts.order || 'relevance',
        regionCode: opts.region || 'FR',
        relevanceLanguage: 'fr',
        videoEmbeddable: 'true'
      }).then(function (j) {
        return videosByIds((j.items || []).map(function (i) { return i.id.videoId; }));
      }).then(noShorts);
    },

    searchChannels: function (q) {
      return api('search', { part: 'snippet', q: q, type: 'channel', maxResults: 5 })
        .then(function (j) {
          var ids = (j.items || []).map(function (i) {
            return i.id.channelId || (i.snippet || {}).channelId;
          });
          return Yt.channels(ids);
        });
    },

    channels: function (ids) {
      ids = (ids || []).filter(Boolean);
      if (!ids.length) { return Promise.resolve([]); }
      return api('channels', {
        part: 'snippet,statistics,contentDetails,brandingSettings',
        id: ids.slice(0, 50).join(',')
      }).then(function (j) { return (j.items || []).map(mapChannel); });
    },

    channelByHandle: function (handle) {
      return api('channels', {
        part: 'snippet,statistics,contentDetails,brandingSettings',
        forHandle: handle
      }).then(function (j) { return (j.items || []).map(mapChannel)[0] || null; });
    },

    channelVideos: function (uploadsPlaylistId, max) {
      return api('playlistItems', {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: max || 30
      }).then(function (j) {
        return videosByIds((j.items || []).map(function (i) { return i.contentDetails.videoId; }));
      }).then(noShorts);
    },

    playlist: function (playlistId) {
      return api('playlists', { part: 'snippet', id: playlistId })
        .then(function (j) {
          var it = (j.items || [])[0];
          return it ? { id: it.id, name: it.snippet.title, channelTitle: it.snippet.channelTitle } : null;
        });
    },

    playlistVideos: function (playlistId, max) {
      return api('playlistItems', {
        part: 'contentDetails', playlistId: playlistId, maxResults: max || 50
      }).then(function (j) {
        return videosByIds((j.items || []).map(function (i) { return i.contentDetails.videoId; }));
      }).then(noShorts);
    },

    video: function (id) {
      return videosByIds([id]).then(function (list) { return list[0] || null; });
    },

    related: function (video) {
      var q = video.title.split(/\s+/).slice(0, 6).join(' ');
      return Yt.search(q).then(function (list) {
        return list.filter(function (v) { return v.id !== video.id; });
      });
    },

    myChannel: function () {
      return api('channels', { part: 'snippet,statistics,contentDetails', mine: 'true' }, { mine: true })
        .then(function (j) { return (j.items || []).map(mapChannel)[0] || null; });
    },

    mySubscriptions: function () {
      var all = [];
      function page(token) {
        return api('subscriptions', {
          part: 'snippet', mine: 'true', maxResults: 50, order: 'alphabetical',
          pageToken: token || ''
        }, { mine: true }).then(function (j) {
          (j.items || []).forEach(function (it) {
            all.push({
              id: it.snippet.resourceId.channelId,
              name: it.snippet.title,
              avatar: ((it.snippet.thumbnails || {}).default || {}).url || ''
            });
          });
          if (j.nextPageToken && all.length < 200) { return page(j.nextPageToken); }
          return all;
        });
      }
      return page('');
    },

    myLiked: function (max) {
      return api('videos', {
        part: 'snippet,contentDetails,statistics', myRating: 'like', maxResults: max || 50
      }, { mine: true }).then(function (j) { return noShorts((j.items || []).map(mapVideo)); });
    },

    myPlaylists: function () {
      return api('playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: 50 },
        { mine: true }).then(function (j) {
        return (j.items || []).map(function (p) {
          return {
            id: p.id,
            name: p.snippet.title,
            count: (p.contentDetails || {}).itemCount || 0,
            thumb: (((p.snippet.thumbnails || {}).medium) || {}).url || '',
            remote: true
          };
        });
      });
    },

    comments: function (videoId) {
      return api('commentThreads', {
        part: 'snippet,replies',
        videoId: videoId,
        maxResults: 20,
        order: 'relevance',
        textFormat: 'plainText'
      }).then(function (j) {
        return (j.items || []).map(function (t) {
          var top = t.snippet.topLevelComment.snippet;
          return {
            id: t.id,
            author: top.authorDisplayName,
            avatar: top.authorProfileImageUrl,
            text: top.textDisplay,
            likes: top.likeCount || 0,
            published: Date.parse(top.publishedAt) || Date.now(),
            replies: (((t.replies || {}).comments) || []).map(function (r) {
              return {
                id: r.id,
                author: r.snippet.authorDisplayName,
                avatar: r.snippet.authorProfileImageUrl,
                text: r.snippet.textDisplay,
                likes: r.snippet.likeCount || 0,
                published: Date.parse(r.snippet.publishedAt) || Date.now(),
                replies: []
              };
            })
          };
        });
      }).catch(function (err) {
        if (err.reason === 'commentsDisabled') { return []; }
        throw err;
      });
    }
  };

  global.Ytb = Yt;
})(window);
