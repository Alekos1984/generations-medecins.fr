/**
 * auth-header.js - injecté sur toutes les pages publiques.
 * - Non connecté : ajoute un lien "Se connecter" à côté du bouton Adhérer.
 * - Connecté     : remplace le bouton Adhérer par un avatar + menu déroulant.
 */
(function () {
  const SUPABASE_URL  = 'https://faegpfkhlkkwmtaichin.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhZWdwZmtobGtrd210YWljaGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTEyODQsImV4cCI6MjA5NTY2NzI4NH0.pHJjb5RIuhRPRi1shnKvScnpLk5Wd8wOiDrmG2143xo';

  /* Trouve le bouton Adhérer dans le header */
  function getAdhererBtn() {
    return document.querySelector('header a[href="adherer.html"]')
        || document.querySelector('a[href="adherer.html"].btn');
  }

  async function init() {
    if (typeof supabase === 'undefined') return;

    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: { session } } = await sb.auth.getSession();

    if (!session) return; // lien "Se connecter" statique reste visible

    /* Connecté = déjà adhérent : adapter les CTA « Adhérer » du corps de page.
       - data-member-href / data-member-cta : CTA piloté par la page (ex. cartes Outils).
         Sans data-member-href, le CTA devient non cliquable (fonctionnalité à venir).
       - .cta-section : gros bouton marketing bas de page → renvoi vers l'espace membre. */
    document.querySelectorAll('[data-member-cta], [data-member-href]').forEach(el => {
      const cta  = el.getAttribute('data-member-cta');
      const href = el.getAttribute('data-member-href');
      if (href) {
        if (cta) el.textContent = cta;
        el.setAttribute('href', href);
      } else {
        const span = document.createElement('span');
        span.className = el.className;
        span.textContent = cta || el.textContent;
        el.replaceWith(span);
      }
    });
    document.querySelectorAll('.cta-section a[href="adherer.html"]').forEach(el => {
      el.setAttribute('href', 'espace-membre.html');
      el.textContent = 'Accéder à mon espace →';
    });

    /* Étape 2 - utilisateur connecté : charger le profil */
    const { data: membre } = await sb
      .from('membres')
      .select('prenom, nom, statut')
      .eq('user_id', session.user.id)
      .single();

    const prenom    = membre?.prenom || session.user.email[0].toUpperCase();
    const nom       = membre?.nom    || '';
    const initiales = (prenom[0] + (nom[0] || '')).toUpperCase();
    const nomComplet = prenom + (nom ? ' ' + nom : '');
    const statut    = membre?.statut || 'en_attente';

    /* CSS avatar */
    if (!document.getElementById('auth-header-style')) {
      const s = document.createElement('style');
      s.id = 'auth-header-style';
      s.textContent = `
        .user-avatar-btn{position:relative;display:inline-flex;align-items:center;gap:8px;cursor:pointer;border:none;background:none;padding:0;font-family:inherit;}
        .user-avatar-circle{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#17365f,#326aa2,#58aab3);color:#fff;font-size:.8rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:box-shadow .2s;}
        .user-avatar-btn:hover .user-avatar-circle{box-shadow:0 0 0 3px rgba(42,109,184,.25);}
        .user-avatar-name{font-size:.82rem;font-weight:700;color:var(--blue-dark,#1a4a80);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .ua-dropdown{position:absolute;top:calc(100% + 10px);right:0;background:#fff;border:1.5px solid #e8edf4;border-radius:14px;box-shadow:0 12px 40px rgba(23,54,95,.14);min-width:200px;padding:8px;z-index:999;display:none;}
        .ua-dropdown.open{display:block;}
        .ua-header{padding:10px 12px 8px;border-bottom:1px solid #e8edf4;margin-bottom:6px;}
        .ua-name{font-size:.85rem;font-weight:800;color:#1a4a80;}
        .ua-status{font-size:.7rem;font-weight:700;margin-top:2px;}
        .ua-actif{color:#2d7a1a;} .ua-attente{color:#b06c00;} .ua-suspendu{color:#b91c1c;}
        .ua-dropdown a,.ua-dropdown button{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;font-size:.83rem;font-weight:600;color:#1a2332;text-decoration:none;width:100%;text-align:left;border:none;background:none;font-family:inherit;cursor:pointer;transition:background .15s;}
        .ua-dropdown a:hover,.ua-dropdown button:hover{background:#f5f7fb;}
        .ua-icon{font-size:1rem;width:20px;text-align:center;font-family:'Apple Color Emoji','Noto Color Emoji','Segoe UI Emoji',sans-serif;}
        .ua-sep{border:none;border-top:1px solid #e8edf4;margin:6px 0;}
        .ua-danger{color:#b91c1c !important;}
      `;
      document.head.appendChild(s);
    }

    /* Widget avatar */
    const statusCls   = { actif:'ua-actif', en_attente:'ua-attente', suspendu:'ua-suspendu' };
    const statusLabel = { actif:'● Actif',  en_attente:'● En attente', suspendu:'● Suspendu' };

    const widget = document.createElement('div');
    widget.className = 'user-avatar-btn';
    widget.setAttribute('role', 'button');
    widget.setAttribute('tabindex', '0');
    widget.innerHTML = `
      <div class="user-avatar-circle">${initiales}</div>
      <span class="user-avatar-name">${prenom}</span>
      <div class="ua-dropdown">
        <div class="ua-header">
          <div class="ua-name">${nomComplet}</div>
          <div class="ua-status ${statusCls[statut]||''}">${statusLabel[statut]||statut}</div>
        </div>
        <a href="espace-membre.html"><span class="ua-icon">👤</span> Mon espace</a>
        <a href="espace-membre.html"><span class="ua-icon">⚙️</span> Paramètres</a>
        <hr class="ua-sep">
        <button class="ua-danger" data-action="logout"><span class="ua-icon">🚪</span> Se déconnecter</button>
      </div>`;

    /* Event delegation sur widget - pas de getElementById sur ses enfants */
    widget.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest('[data-action="logout"]')) {
        sb.auth.signOut().then(() => { window.location.href = 'index.html'; });
        return;
      }
      widget.querySelector('.ua-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => {
      const dd = widget.querySelector('.ua-dropdown');
      if (dd) dd.classList.remove('open');
    });

    /* Cacher le lien "Se connecter" statique */
    const loginLinkEl = document.getElementById('header-login-link');
    if (loginLinkEl) loginLinkEl.style.display = 'none';

    /* Masquer TOUS les liens Adhérer dans le header */
    document.querySelectorAll('header a[href="adherer.html"], header a[href*="adherer"]')
      .forEach(el => el.style.display = 'none');

    /* Insérer le widget à la place */
    const adhererBtn = getAdhererBtn();
    if (adhererBtn) {
      adhererBtn.replaceWith(widget);
    } else {
      const hi = document.querySelector('.header-inner');
      if (hi) hi.appendChild(widget);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
