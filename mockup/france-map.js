/**
 * Carte de France interactive — composant réutilisable.
 *
 * Charge le GeoJSON des régions métropolitaines (simplifié, ~50 Ko) depuis
 * jsDelivr (repo public gregoiredavid/france-geojson), construit le SVG,
 * et expose deux modes :
 *
 *   - "select"   : clic sur une région → callback onRegionSelect(code)
 *   - "heatmap"  : coloration par valeur (vert clair → vert foncé)
 *
 * Usage HTML :
 *   <div id="ma-carte" data-france-map data-mode="select"></div>
 *
 * Usage JS :
 *   FranceMap.render('#ma-carte', {
 *     mode: 'select',           // ou 'heatmap'
 *     selected: '11',           // code région présélectionné (optionnel)
 *     values: { '11': 52000, '84': 41000, ... },   // pour heatmap
 *     onSelect: (code, name) => console.log(code, name),
 *     showFranceEntiere: true,  // bouton "France entière" au-dessus
 *   });
 *
 * Codes région INSEE (métropole) :
 *   11 Île-de-France · 24 Centre-Val de Loire · 27 Bourgogne-FC · 28 Normandie
 *   32 Hauts-de-France · 44 Grand Est · 52 Pays de la Loire · 53 Bretagne
 *   75 Nouvelle-Aquitaine · 76 Occitanie · 84 AURA · 93 PACA · 94 Corse
 *   'FR' = France entière (cas spécial, pas affiché sur la carte)
 */
(function() {
  const GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/regions-version-simplifiee.geojson';

  const REGION_NAMES = {
    'FR': 'France entière',
    '11': 'Île-de-France', '24': 'Centre-Val de Loire', '27': 'Bourgogne-Franche-Comté',
    '28': 'Normandie',      '32': 'Hauts-de-France',    '44': 'Grand Est',
    '52': 'Pays de la Loire','53': 'Bretagne',          '75': 'Nouvelle-Aquitaine',
    '76': 'Occitanie',      '84': 'Auvergne-Rhône-Alpes','93': "Provence-Alpes-Côte d'Azur",
    '94': 'Corse',
  };

  let geojsonCache = null;
  async function loadGeoJson() {
    if (geojsonCache) return geojsonCache;
    const r = await fetch(GEOJSON_URL);
    if (!r.ok) throw new Error('Impossible de charger la carte (' + r.status + ')');
    geojsonCache = await r.json();
    return geojsonCache;
  }

  // Projection Mercator basique (suffisante pour la France métro)
  function project(lng, lat, bbox, w, h) {
    const [minX, minY, maxX, maxY] = bbox;
    const x = ((lng - minX) / (maxX - minX)) * w;
    const y = h - ((lat - minY) / (maxY - minY)) * h;
    return [x, y];
  }

  function bbox(geojson) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(coords) {
      if (typeof coords[0] === 'number') {
        const [x, y] = coords;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else coords.forEach(walk);
    }
    geojson.features.forEach(f => walk(f.geometry.coordinates));
    return [minX, minY, maxX, maxY];
  }

  function polygonsToPath(geom, bb, w, h) {
    // MultiPolygon ou Polygon — on construit un d="M...L...Z M..."
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    let d = '';
    polys.forEach(rings => {
      rings.forEach(ring => {
        ring.forEach(([lng, lat], i) => {
          const [x, y] = project(lng, lat, bb, w, h);
          d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
        });
        d += 'Z ';
      });
    });
    return d;
  }

  // Interpole une couleur entre 2 hex (heatmap)
  function lerpColor(c1, c2, t) {
    const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    const ar = (a>>16)&255, ag = (a>>8)&255, ab = a&255;
    const br = (b>>16)&255, bg = (b>>8)&255, bb = b&255;
    const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), bl = Math.round(ab + (bb-ab)*t);
    return '#' + ((r<<16)|(g<<8)|bl).toString(16).padStart(6,'0');
  }

  async function render(targetSel, opts = {}) {
    const target = typeof targetSel === 'string' ? document.querySelector(targetSel) : targetSel;
    if (!target) throw new Error('Cible introuvable : ' + targetSel);

    let geojson;
    target.innerHTML = '<div style="color:var(--muted,#64748b);font-size:.85rem;padding:24px;text-align:center">Chargement de la carte…</div>';
    try { geojson = await loadGeoJson(); }
    catch (e) {
      target.innerHTML = '<div style="color:#dc2626;font-size:.85rem;padding:12px">Erreur carte : ' + e.message + '</div>';
      return;
    }

    const w = 520, h = 540;
    const bb = bbox(geojson);
    let selected = opts.selected || null;
    const values = opts.values || {};
    const mode = opts.mode || 'select';
    const onSelect = opts.onSelect || (() => {});
    const showFranceEntiere = opts.showFranceEntiere !== false;

    // Heatmap : trouve min/max pour normaliser
    const vals = Object.values(values).filter(v => typeof v === 'number' && !isNaN(v));
    const minV = vals.length ? Math.min(...vals) : 0;
    const maxV = vals.length ? Math.max(...vals) : 1;
    function colorFor(code) {
      if (mode !== 'heatmap') return selected === code ? '#1e40af' : '#dbeafe';
      const v = values[code];
      if (v == null) return '#e5e7eb';
      const t = maxV > minV ? (v - minV) / (maxV - minV) : 0;
      return lerpColor('#dcfce7', '#15803d', t);
    }

    function paths() {
      return geojson.features.map(f => {
        const code = f.properties.code || f.properties.code_insee || f.properties.codeRegion;
        const name = REGION_NAMES[code] || f.properties.nom || code;
        const d = polygonsToPath(f.geometry, bb, w, h);
        const fill = colorFor(code);
        const stroke = selected === code ? '#1e3a8a' : '#94a3b8';
        const strokeW = selected === code ? 2 : 0.6;
        return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"
                      data-code="${code}" data-name="${name}"
                      style="cursor:pointer;transition:fill .15s"
                      onmouseenter="this.setAttribute('data-prev-fill', this.getAttribute('fill')); this.setAttribute('fill', '#fbbf24')"
                      onmouseleave="this.setAttribute('fill', this.getAttribute('data-prev-fill') || '${fill}')"/>`;
      }).join('');
    }

    function buildTooltip(code, name) {
      const v = values[code];
      const vTxt = v != null ? `<br><b>${v.toLocaleString('fr-FR')}</b>` : '';
      return `${name}${vTxt}`;
    }

    function html() {
      const franceBtn = showFranceEntiere ? `
        <button data-code="FR" class="fmap-region-btn ${selected==='FR'?'is-active':''}"
          style="padding:6px 14px;border:1.5px solid ${selected==='FR'?'#1e40af':'#cbd5e1'};
                 background:${selected==='FR'?'#1e40af':'white'};color:${selected==='FR'?'white':'#1e293b'};
                 border-radius:8px;font-weight:700;cursor:pointer;font-size:.82rem;font-family:inherit;margin-bottom:12px">
          🇫🇷 France entière
        </button>` : '';
      return `
        ${franceBtn}
        <div style="position:relative;display:inline-block;width:100%;max-width:520px">
          <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;background:#f8fafc;border-radius:12px">
            ${paths()}
          </svg>
          <div class="fmap-tooltip" style="position:absolute;background:#0f172a;color:white;padding:6px 10px;border-radius:6px;font-size:.78rem;pointer-events:none;display:none;z-index:10"></div>
        </div>
      `;
    }

    target.innerHTML = html();
    const svg = target.querySelector('svg');
    const tip = target.querySelector('.fmap-tooltip');

    svg.addEventListener('mousemove', e => {
      const t = e.target;
      if (t.tagName === 'path') {
        const code = t.getAttribute('data-code');
        const name = t.getAttribute('data-name');
        tip.innerHTML = buildTooltip(code, name);
        tip.style.display = 'block';
        const r = svg.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 10) + 'px';
        tip.style.top  = (e.clientY - r.top  - 30) + 'px';
      }
    });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

    svg.addEventListener('click', e => {
      if (e.target.tagName === 'path') {
        selected = e.target.getAttribute('data-code');
        target.innerHTML = html();
        // ré-attache les listeners
        render(targetSel, { ...opts, selected, onSelect });
        onSelect(selected, REGION_NAMES[selected] || selected);
      }
    });

    if (showFranceEntiere) {
      const btn = target.querySelector('.fmap-region-btn[data-code="FR"]');
      if (btn) btn.addEventListener('click', () => {
        selected = 'FR';
        render(targetSel, { ...opts, selected, onSelect });
        onSelect('FR', 'France entière');
      });
    }
  }

  window.FranceMap = { render, REGION_NAMES };

  // Auto-init pour les éléments avec data-france-map
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-france-map]').forEach(el => {
      render(el, {
        mode: el.dataset.mode || 'select',
        selected: el.dataset.selected || null,
      });
    });
  });
})();
