/* ══════════════════════════════════════════════════
   Puntos de recarga eléctrica · España (Mapa Reve)
   ══════════════════════════════════════════════════ */

const CARGADORES_FILE = 'cargadores.pmtiles';

/* ── Fecha de última actualización ── */
fetch('metadata.json')
  .then(r => r.json())
  .then(m => {
    if (!m.actualizado) return;
    const d = new Date(m.actualizado);
    const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('header-fecha').textContent = `Datos: ${label}`;
  })
  .catch(() => {});

/* ── Mapa ── */
const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [] },
  center: [-3.7, 40.4],
  zoom: 5.5,
  minZoom: 4,
  maxBounds: [[-20, 25], [10, 56]],
  antialias: true,
});

const infoPanel = document.getElementById('info-panel');
let popup      = null;
let colorMode  = 'potencia';   // 'potencia' | 'acceso'
let filtroActivo = 'todos';

/* ── Nombres cortos de estándares ── */
const STD = {
  'IEC_62196_T2_COMBO': 'CCS2',
  'IEC_62196_T2':       'Tipo 2',
  'CHADEMO':            'CHAdeMO',
  'IEC_62196_T1_COMBO': 'CCS1',
  'GBT_DC':             'GB/T',
  'IEC_62196_T1':       'Tipo 1',
  'DOMESTIC_F':         'Schuko',
  'DOMESTIC_E':         'Francés',
};

/* ── Escala de color por potencia (monocromática #01f3b3) ── */
const potenciaColor = [
  'case',
  ['!', ['has', 'potencia_max_kw']], '#d1faf3',
  ['interpolate', ['linear'], ['get', 'potencia_max_kw'],
    7.4,  '#b3f9e6',   // AC estándar (7–22 kW)
    22,   '#33f2be',   // AC/DC semirápido (22–50 kW)
    50,   '#01f3b3',   // DC rápido (50–150 kW)
    150,  '#009e74',   // DC ultra (150–350 kW)
    400,  '#004d38',   // DC hyperfast (> 350 kW)
  ],
];

/* ── Color por accesibilidad ── */
const accesibilidadColor = [
  'match', ['get', 'accesibilidad'],
  'SI',           '#01f3b3',
  'NO',           '#f97316',
  'NODISPONIBLE', '#9ca3af',
  '#d1d5db',
];

/* ── Leyendas ── */
const LEY = {
  potencia: `
    <div class="lp-titulo">Potencia máxima</div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-dot" style="background:#b3f9e6"></span>7 – 22 kW · AC estándar</div>
      <div class="lp-step"><span class="lp-dot" style="background:#33f2be"></span>22 – 50 kW · AC/DC semirápido</div>
      <div class="lp-step"><span class="lp-dot" style="background:#01f3b3"></span>50 – 150 kW · DC rápido</div>
      <div class="lp-step"><span class="lp-dot" style="background:#009e74"></span>150 – 350 kW · DC ultra</div>
      <div class="lp-step"><span class="lp-dot" style="background:#004d38"></span>> 350 kW · DC hyperfast</div>
    </div>`,
  acceso: `
    <div class="lp-titulo">Accesibilidad</div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-dot" style="background:#01f3b3"></span>Accesible públicamente</div>
      <div class="lp-step"><span class="lp-dot" style="background:#f97316"></span>Acceso restringido</div>
      <div class="lp-step"><span class="lp-dot" style="background:#9ca3af"></span>No disponible / sin datos</div>
    </div>`,
};

/* ── Filtro activo → expresión MapLibre ── */
function filtroExpresion() {
  switch (filtroActivo) {
    case 'dc':      return ['==', ['get', 'tiene_dc'],      1];
    case 'ac':      return ['==', ['get', 'tiene_ac'],      1];
    case 'ccs2':    return ['==', ['get', 'tiene_ccs2'],    1];
    case 'chademo': return ['==', ['get', 'tiene_chademo'], 1];
    case 't2':      return ['==', ['get', 'tiene_t2'],      1];
    default:        return null;
  }
}

function aplicarFiltro() {
  map.setFilter('cargadores-circle', filtroExpresion());
}

/* ── Carga ── */
map.on('load', async () => { try {

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

  /* Mapa base CARTO light */
  map.addSource('basemap', {
    type: 'raster',
    tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  });
  map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' });

  /* Fuente PMTiles */
  map.addSource('cargadores', { type: 'vector', url: `pmtiles://${CARGADORES_FILE}` });

  /* Círculos — visibles desde el zoom inicial */
  map.addLayer({
    id: 'cargadores-circle',
    type: 'circle',
    source: 'cargadores',
    'source-layer': 'cargadores',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 8, 3.5, 12, 6, 16, 10],
      'circle-color': potenciaColor,
      'circle-opacity': 0.88,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0, 8, 0.8, 14, 1.5],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.65,
    },
  });

  /* Controles */
  map.addControl(new GeocoderControl(), 'top-right');
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  /* ── Panel info (hover) ── */
  map.on('mousemove', 'cargadores-circle', e => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features?.[0]?.properties;
    if (!p) return;
    renderPanelEvse(p);
    infoPanel.classList.remove('ip-hidden');
  });
  map.on('mouseleave', 'cargadores-circle', () => {
    map.getCanvas().style.cursor = '';
    infoPanel.classList.add('ip-hidden');
  });

  /* ── Popup (click) ── */
  map.on('click', 'cargadores-circle', e => {
    const feat = e.features?.[0];
    if (!feat) return;
    renderPopupEvse(e.lngLat, feat.properties);
  });

  map.on('click', e => {
    const bbox  = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
    const feats = map.queryRenderedFeatures(bbox, { layers: ['cargadores-circle'] });
    if (!feats.length && popup?.isOpen()) popup.remove();
  });

  /* ── Color toggle ── */
  document.getElementById('btn-potencia').addEventListener('click', () => setColor('potencia'));
  document.getElementById('btn-acceso').addEventListener('click',   () => setColor('acceso'));

  /* ── Filtro chips ── */
  document.querySelectorAll('[data-filtro]').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroActivo = btn.dataset.filtro;
      document.querySelectorAll('[data-filtro]').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      aplicarFiltro();
    });
  });

  /* ── Reset ── */
  document.getElementById('reset-btn').addEventListener('click', () =>
    map.flyTo({ center: [-3.7, 40.4], zoom: 5.5, duration: 1200 })
  );

  renderLeyenda();

} catch (err) {
  console.error('Error inicializando el mapa:', err);
}});

/* ── Cambio de modo de color ── */
function setColor(mode) {
  colorMode = mode;
  map.setPaintProperty(
    'cargadores-circle', 'circle-color',
    mode === 'potencia' ? potenciaColor : accesibilidadColor
  );
  document.getElementById('btn-potencia').classList.toggle('active', mode === 'potencia');
  document.getElementById('btn-acceso').classList.toggle('active',   mode === 'acceso');
  renderLeyenda();
}

function renderLeyenda() {
  document.getElementById('leyenda-panel').innerHTML = LEY[colorMode];
}

/* ── Panel de info (hover) ── */
function renderPanelEvse(p) {
  const nombre    = p.nombre    || p.cpo_name || '—';
  const dir       = [p.direccion, p.ciudad].filter(Boolean).join(', ');
  const estandares = p.estandar_list || '—';
  const potencia  = p.potencia_max_kw != null ? `${p.potencia_max_kw} kW` : '—';
  const acceso    = ({ SI: 'Accesible', NO: 'Restringido', NODISPONIBLE: 'No disp.' })[p.accesibilidad] || '—';
  const precioStr = p.precio_energia_eur_kwh != null ? `${p.precio_energia_eur_kwh} €/kWh`
                  : p.precio_conexion_eur    != null ? `${p.precio_conexion_eur} € conexión`
                  : p.precio_tiempo_eur_min  != null ? `${p.precio_tiempo_eur_min} €/min`
                  : null;
  const fechaEvse = formatFecha(p.evse_actualizado);

  infoPanel.innerHTML = `
    <div class="ip-bar"></div>
    <div class="ip-body">
      <div class="ip-header">
        <span class="ip-tag">${escHtml(p.cpo_name || '')}</span>
      </div>
      <div class="ip-name">${escHtml(nombre)}</div>
      ${dir ? `<div class="ip-sub">${escHtml(dir)}</div>` : ''}
      <div class="ip-sep"></div>
      <div class="ip-stats">
        <div class="ip-stat">
          <span class="ip-stat-val">${potencia}</span>
          <span class="ip-stat-key">Pot. máx.</span>
        </div>
        <div class="ip-stat">
          <span class="ip-stat-val">${p.num_conectores ?? '—'}</span>
          <span class="ip-stat-key">Conectores</span>
        </div>
        <div class="ip-stat ip-stat--wide">
          <span class="ip-stat-val ip-stat-val--sm">${escHtml(estandares)}</span>
          <span class="ip-stat-key">Estándar</span>
        </div>
        <div class="ip-stat">
          <span class="ip-stat-val ip-stat-val--sm">${acceso}</span>
          <span class="ip-stat-key">Acceso</span>
        </div>
      </div>
      ${(precioStr || fechaEvse) ? `
      <div class="ip-footer">
        <span class="ip-precio">${precioStr ? escHtml(precioStr) : '—'}</span>
        ${fechaEvse ? `<span class="ip-fecha">Act. ${fechaEvse}</span>` : ''}
      </div>` : ''}
    </div>`;
}

/* ── Popup (click) ── */
function renderPopupEvse(lngLat, p) {
  const nombre    = p.nombre    || p.cpo_name || '—';
  const dir       = p.direccion || '';
  const loc       = [p.ciudad, p.codigo_postal].filter(Boolean).join(' ');
  const evseId    = p.evse_id   || '';
  const estandares = p.estandar_list || '—';
  const potencia  = p.potencia_max_kw != null ? `${p.potencia_max_kw} kW` : '—';
  const acceso    = ({ SI: 'Accesible', NO: 'Restringido', NODISPONIBLE: 'No disponible' })[p.accesibilidad] || '—';
  const h24       = p.horario_24h ? '24 h' : null;
  const tipoCte   = p.tipo_cte  || '';
  const fechaEvse = formatFecha(p.evse_actualizado);
  const tarifaHtml = buildTarifaHtml(p);

  const mapsQuery = [nombre, dir, loc, 'España'].filter(Boolean).join(', ');
  const mapsUrl   = `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`;

  const stat = (k, v) => v ? `<div class="pp-stat"><span class="pp-stat-key">${k}</span><span class="pp-stat-val">${escHtml(String(v))}</span></div>` : '';

  const html = `
    <div>
      <div class="pp-bar"></div>
      <div class="pp-inner">
        <div class="pp-header">
          <span class="pp-badge">${escHtml(p.cpo_name || 'Operador desconocido')}</span>
          ${tipoCte ? `<span class="pp-tipo pp-tipo--${tipoCte.toLowerCase()}">${tipoCte}</span>` : ''}
        </div>
        <p class="pp-nombre">${escHtml(nombre)}</p>
        ${dir || loc ? `
          <div class="pp-sep"></div>
          <div class="pp-addr">
            ${dir  ? `<span class="pp-addr-line pp-addr-line--street">${escHtml(dir)}</span>` : ''}
            ${loc  ? `<span class="pp-addr-line">${escHtml(loc)}</span>` : ''}
          </div>` : ''}
        <div class="pp-sep"></div>
        <div class="pp-stats">
          ${stat('EVSE ID',     evseId)}
          ${stat('Estándar',    estandares)}
          ${stat('Potencia',    potencia)}
          ${stat('Acceso',      acceso)}
          ${stat('Horario',     h24)}
          ${stat('Actualizado', fechaEvse)}
        </div>
        ${tarifaHtml ? `<div class="pp-sep"></div>${tarifaHtml}` : ''}
        <a class="pp-link" href="${mapsUrl}" target="_blank" rel="noopener">Ver en Google Maps →</a>
      </div>
    </div>`;

  if (!popup) popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 14, maxWidth: '280px' });
  popup.setLngLat(lngLat).setHTML(html).addTo(map);
}

/* ── Utilidades ── */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildTarifaHtml(p) {
  const rows = [];
  if (p.precio_energia_eur_kwh != null) rows.push(['Energía', `${p.precio_energia_eur_kwh} €/kWh`]);
  if (p.precio_tiempo_eur_min  != null) rows.push(['Tiempo',  `${p.precio_tiempo_eur_min} €/min`]);
  if (p.precio_conexion_eur    != null) rows.push(['Inicio',  `${p.precio_conexion_eur} €`]);
  if (p.precio_aparcamiento_eur_min != null) rows.push(['Parking', `${p.precio_aparcamiento_eur_min} €/min`]);
  if (!rows.length) return null;
  const fechaTarifa = formatFecha(p.tarifa_actualizada);
  const moneda = p.moneda ? ` · ${p.moneda}` : '';
  return `<div class="pp-tarifa">
    <div class="pp-tarifa-titulo">Tarifa${escHtml(moneda)}</div>
    ${rows.map(([k, v]) => `<div class="pp-tarifa-row"><span>${k}</span><span class="pp-tarifa-val">${escHtml(String(v))}</span></div>`).join('')}
    ${fechaTarifa ? `<div class="pp-tarifa-fecha">Act. ${fechaTarifa}</div>` : ''}
  </div>`;
}

/* ══════════════════════════════════════════
   Geocoder (Nominatim)
   ══════════════════════════════════════════ */
class GeocoderControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl geocoder-ctrl';
    this._input = document.createElement('input');
    this._input.type = 'text';
    this._input.placeholder = 'Buscar lugar…';
    this._input.className = 'geocoder-input';
    this._input.setAttribute('autocomplete', 'off');
    this._list = document.createElement('div');
    this._list.className = 'geocoder-results';
    this._list.hidden = true;
    this._container.appendChild(this._input);
    this._container.appendChild(this._list);

    let timer;
    this._input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = this._input.value.trim();
      if (q.length < 3) { this._list.innerHTML = ''; this._list.hidden = true; return; }
      timer = setTimeout(() => this._search(q), 350);
    });
    this._input.addEventListener('keydown', e => { if (e.key === 'Escape') this._list.hidden = true; });
    document.addEventListener('click', e => { if (!this._container.contains(e.target)) this._list.hidden = true; });
    return this._container;
  }

  async _search(q) {
    try {
      const data = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=es&countrycodes=es`
      ).then(r => r.json());
      this._render(data);
    } catch { /* sin red */ }
  }

  _render(items) {
    this._list.innerHTML = '';
    if (!items.length) {
      const el = document.createElement('div');
      el.className = 'geocoder-item geocoder-empty';
      el.textContent = 'Sin resultados';
      this._list.appendChild(el);
    } else {
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'geocoder-item';
        el.textContent = item.display_name;
        el.addEventListener('click', () => {
          this._input.value = item.display_name;
          this._list.hidden = true;
          const bb = item.boundingbox;
          if (bb) {
            this._map.fitBounds(
              [[parseFloat(bb[2]), parseFloat(bb[0])], [parseFloat(bb[3]), parseFloat(bb[1])]],
              { padding: 60, maxZoom: 14 }
            );
          } else {
            this._map.flyTo({ center: [parseFloat(item.lon), parseFloat(item.lat)], zoom: 13 });
          }
        });
        this._list.appendChild(el);
      });
    }
    this._list.hidden = false;
  }

  onRemove() { this._container.parentNode?.removeChild(this._container); }
}
