/* Connexion Google (Google Identity Services, modèle « token »).
   Aucun secret client : tout se passe dans le navigateur, le jeton vit en
   sessionStorage et expire au bout d'une heure. Lecture seule sur YouTube. */
(function (global) {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
  var SESSION = 'vidflow.token';
  var gisReady = null;
  var tokenClient = null;
  var listeners = [];
  var profile = null;

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION)) || null; } catch (e) { return null; }
  }

  function setSession(value) {
    try {
      if (value) { sessionStorage.setItem(SESSION, JSON.stringify(value)); }
      else { sessionStorage.removeItem(SESSION); }
    } catch (e) { /* mode privé */ }
    listeners.forEach(function (fn) { fn(); });
  }

  function loadGis() {
    if (gisReady) { return gisReady; }
    gisReady = new Promise(function (resolve, reject) {
      if (global.google && global.google.accounts && global.google.accounts.oauth2) {
        resolve(global.google);
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () {
        if (global.google && global.google.accounts) { resolve(global.google); }
        else { reject(new Error('gis-indisponible')); }
      };
      s.onerror = function () { reject(new Error('gis-bloque')); };
      document.head.appendChild(s);
    });
    return gisReady;
  }

  var Auth = {
    scope: SCOPE,

    clientId: function () { return (Store.state.googleClientId || '').trim(); },

    isConfigured: function () { return !!Auth.clientId(); },

    isSignedIn: function () {
      var s = session();
      return !!(s && s.token && s.expires > Date.now() + 5000);
    },

    token: function () { return Auth.isSignedIn() ? session().token : ''; },

    profile: function () { return profile || (session() || {}).profile || null; },

    onChange: function (fn) { listeners.push(fn); },

    signIn: function () {
      if (!Auth.isConfigured()) {
        return Promise.reject(new Error('client-id-manquant'));
      }
      return loadGis().then(function (google) {
        return new Promise(function (resolve, reject) {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: Auth.clientId(),
            scope: SCOPE,
            callback: function (resp) {
              if (resp.error) { reject(new Error(resp.error)); return; }
              setSession({
                token: resp.access_token,
                expires: Date.now() + (resp.expires_in || 3600) * 1000,
                profile: null
              });
              resolve(resp.access_token);
            },
            error_callback: function (err) { reject(new Error((err && err.type) || 'popup-fermee')); }
          });
          tokenClient.requestAccessToken({ prompt: '' });
        });
      }).then(function (token) {
        return Auth.loadProfile().then(function () { return token; });
      });
    },

    loadProfile: function () {
      if (!Auth.isSignedIn()) { return Promise.resolve(null); }
      return Ytb.myChannel().then(function (ch) {
        profile = ch ? { name: ch.name, avatar: ch.avatar, channelId: ch.id } : null;
        var s = session();
        if (s) { s.profile = profile; setSession(s); }
        return profile;
      }).catch(function () { return null; });
    },

    signOut: function () {
      var t = Auth.token();
      profile = null;
      setSession(null);
      if (t && global.google && global.google.accounts && global.google.accounts.oauth2) {
        try { global.google.accounts.oauth2.revoke(t, function () {}); } catch (e) { /* ignore */ }
      }
    }
  };

  global.Auth = Auth;
})(window);
