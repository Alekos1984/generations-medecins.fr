/**
 * security.js - utilitaires de sécurité partagés (anti-XSS).
 *   escHtml(s)   : échappe & < > " '  (texte ET attributs)
 *   safeUrl(u)   : n'accepte que http(s), sinon '#'
 *   safeHtml(h)  : HTML assaini par DOMPurify (repli : échappement)
 * Avec <script src="security.js" data-safe-html></script>, toute affectation
 * à .innerHTML est automatiquement assainie (pages publiques sans handlers inline).
 */
(function () {
  window.escHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  window.safeUrl = function (u) {
    return /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '#';
  };
  window.safeHtml = function (h) {
    if (!window.DOMPurify) return window.escHtml(h);
    return DOMPurify.sanitize(String(h == null ? '' : h), { ADD_ATTR: ['target', 'rel'] });
  };
  var cs = document.currentScript;
  if (cs && cs.hasAttribute('data-safe-html')) {
    var d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get: function () { return d.get.call(this); },
      set: function (v) { d.set.call(this, typeof v === 'string' ? window.safeHtml(v) : v); },
    });
  }
})();
