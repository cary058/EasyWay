
/**
 * Accessibility Drones - Stable Release
 * Core Logic
 */

const App = {
  // =================================
  // 1. DATA & CONFIG
  // =================================
  Config: {
    center: [51.1280, 71.4304], // Astana
    zoom: 15,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  },

  Data: {
    // Mock 2GIS Database
    locations: [
      { name: "Байтерек", address: "Водно-зелёный бульвар 1", lat: 51.1280, lng: 71.4304 },
      { name: "Хан Шатыр", address: "Туран 37", lat: 51.1235, lng: 71.4350 },
      { name: "Акорда", address: "Тауелсиздик 2", lat: 51.1340, lng: 71.4340 },
      { name: "Mega Silk Way", address: "Кабанбай Батыра 62", lat: 51.1195, lng: 71.4260 },
      { name: "Botanical Garden", address: "Туркестан", lat: 51.1350, lng: 71.4250 },
      { name: "Expo 2017", address: "Мангилик Ел 55", lat: 51.1265, lng: 71.4290 },
      { name: "Keruen Mall", address: "Достык 9", lat: 51.1225, lng: 71.4400 },
      { name: "Abu Dhabi Plaza", address: "Сыганак 16", lat: 51.1330, lng: 71.4380 },
      { name: "National Museum", address: "Тауелсиздик 54", lat: 51.1290, lng: 71.4250 },
      { name: "Peace Palace", address: "Тауелсиздик 57", lat: 51.1285, lng: 71.4200 }
    ]
  },

  State: {
  start: null,
  end: null,
  routeLayer: null,
  markers: [],
  mode: 'view',
  barrierMode: false,

  userProfile: {
    mobility: 'wheelchair' // default
  }
},

  },

  // =================================
  // 2. SEARCH ENGINE (MOCK 2GIS)
  // =================================
  Search: {
    async query(text) {
      return new Promise(resolve => {
        setTimeout(() => {
          if (!text || text.length < 2) return resolve([]);
          const q = text.toLowerCase();
          const results = App.Data.locations.filter(l =>
            l.name.toLowerCase().includes(q) ||
            l.address.toLowerCase().includes(q)
          );
          resolve(results);
        }, 150);
      });
    }
  },

  // =================================
  // 3. MAP ENGINE
  // =================================
  Map: {
    instance: null,

    init() {
      this.instance = L.map('map', { zoomControl: false }).setView(App.Config.center, App.Config.zoom);

      L.tileLayer(App.Config.tileUrl, {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.instance);

      L.control.zoom({ position: 'bottomright' }).addTo(this.instance);

      this.instance.on('click', (e) => App.Controllers.handleMapClick(e));

      // Force resize after init
      setTimeout(() => this.instance.invalidateSize(), 200);
    },

    addMarker(lat, lng, type) {
      const color = type === 'start' ? '#22c55e' : (type === 'end' ? '#ef4444' : '#3b82f6');
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${color};width:24px;height:24px;border:3px solid white;border-radius:50%;box-shadow:0 4px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [24, 24]
        })
      }).addTo(this.instance);

      App.State.markers.push(marker);
      return marker;
    },

    clearMarkers() {
      App.State.markers.forEach(m => m.remove());
      App.State.markers = [];
    },

    drawRoute(coords) {
      if (App.State.routeLayer) App.State.routeLayer.remove();

      App.State.routeLayer = L.polyline(coords, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.8,
        lineCap: 'round'
      }).addTo(this.instance);

      this.instance.fitBounds(coords, { padding: [50, 50] });
    }
  },

  // =================================
  // 4. ROUTER (OSRM)
  // =================================
  Router: {
    service: null,

    init() {
      this.service = L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: 'foot'
      });
    },

    calculate(start, end) {
      return new Promise((resolve, reject) => {
        const waypoints = [
          L.latLng(start.lat, start.lng),
          L.latLng(end.lat, end.lng)
        ];

        this.service.route(waypoints, (err, routes) => {
          if (err || !routes || !routes.length) {
            return reject("Маршрут не найден");
          }
          resolve(routes[0]);
        });
      });
    }
  },

  // =================================
  // 5. UI CONTROLLER
  // =================================
  UI: {
    init() {
      this.renderBase();
      this.bindEvents();
    },

    renderBase() {
      document.getElementById('app').innerHTML = `
                <aside class="sidebar">
                    <div class="header">
                        <div class="logo">
                            <span style="font-size:1.5rem">🚁</span> Дроны Доступности
                        </div>
                    </div>
                    <div class="content">
                        <!-- Search Section -->
                        <div class="route-card">
                            <div class="input-row">
                                <div class="dot start"></div>
                                <input id="inp-start" placeholder="Откуда..." autocomplete="off">
                                <button class="btn-map" onclick="App.Controllers.setMode('select_start')">📍</button>
                                <div id="sugg-start" class="suggestions"></div>
                            </div>
                            <div class="input-row">
                                <div class="dot end"></div>
                                <input id="inp-end" placeholder="Куда..." autocomplete="off">
                                <button class="btn-map" onclick="App.Controllers.setMode('select_end')">📍</button>
                                <div id="sugg-end" class="suggestions"></div>
                            </div>
                            <div class="action-bar" style="margin-top:1rem">
                                <button id="btn-go" class="btn btn-primary" onclick="App.Controllers.buildRoute()">Построить</button>
                                <button class="btn btn-secondary" onclick="App.Controllers.reset()">Сброс</button>
                            </div>
                        </div>

                        <!-- Settings (Visual Only) -->
                        <div class="settings-section">
                            <h3>Параметры доступности</h3>
                            <div class="setting-item">
  <div class="setting-header">
    <span>Тип передвижения</span>
  </div>

  <div class="radio-group">
    <label>
      <input type="radio" name="mobility" value="wheelchair" checked>
      Инвалидная коляска
    </label>

    <label>
      <input type="radio" name="mobility" value="wheelchair_helper">
      Коляска с помощником
    </label>

    <label>
      <input type="radio" name="mobility" value="stroller">
      Детская коляска
    </label>

    <label>
      <input type="radio" name="mobility" value="cane">
      Трость / костыли
    </label>
  </div>
</div>

                            
                            <div class="setting-item">
                                <div class="setting-header">
                                    <span>Макс. уклон</span>
                                    <span id="val-slope" class="setting-val">5%</span>
                                </div>
                                <input type="range" min="0" max="15" value="5" oninput="App.UI.updateVal('slope', this.value, '%')">
                            </div>

                            <div class="setting-item">
                                <div class="setting-header">
                                    <span>Высота бордюра</span>
                                    <span id="val-curb" class="setting-val">4 см</span>
                                </div>
                                <input type="range" min="0" max="15" value="4" oninput="App.UI.updateVal('curb', this.value, ' см')">
                            </div>

                            <div class="setting-item">
                                <div class="setting-header">
                                    <span>Мин. ширина</span>
                                    <span id="val-width" class="setting-val">90 см</span>
                                </div>
                                <input type="range" min="60" max="150" value="90" oninput="App.UI.updateVal('width', this.value, ' см')">
                            </div>
                        </div>
                    </div>
                </aside>
                
                <div class="map-wrapper">
                    <div id="map"></div>
                    <div class="map-controls">
                        <button class="fab warning" onclick="App.Controllers.startReport()">⚠️</button>
                        <button class="fab" onclick="App.Controllers.locateUser()">🎯</button>
                    </div>
                </div>
            `;
    },

    bindEvents() {
  this.setupAutocomplete('inp-start', 'sugg-start', (loc) => App.Controllers.setPoint('start', loc));
  this.setupAutocomplete('inp-end', 'sugg-end', (loc) => App.Controllers.setPoint('end', loc));

  // 🔽 ВОТ ЭТО ДОБАВЬ
  document.querySelectorAll('input[name="mobility"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      App.State.userProfile.mobility = e.target.value;
      console.log('Тип передвижения:', App.State.userProfile.mobility);
    });
  });
}

    },

    setupAutocomplete(inpId, listId, cb) {
      const inp = document.getElementById(inpId);
      const list = document.getElementById(listId);

      inp.addEventListener('input', async (e) => {
        const res = await App.Search.query(e.target.value);
        if (res.length) {
          list.innerHTML = res.map((r, i) => `
                        <div class="suggestion-item" data-idx="${i}">
                            <div class="s-name">${r.name}</div>
                            <div class="s-addr">${r.address}</div>
                        </div>
                    `).join('');
          list.style.display = 'block';
          list.querySelectorAll('.suggestion-item').forEach(el => {
            el.onclick = () => {
              const item = res[el.dataset.idx];
              cb(item);
              list.style.display = 'none';
            };
          });
        } else {
          list.style.display = 'none';
        }
      });

      document.addEventListener('click', (e) => {
        if (e.target !== inp && e.target !== list) list.style.display = 'none';
      });
    },

    updateVal(id, val, suffix) {
      document.getElementById(`val-${id}`).textContent = val + suffix;
    },

    showModal(html) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `<div class="modal">${html}</div>`;
      document.body.appendChild(overlay);
      return overlay;
    },

    updateInput(type, val) {
      document.getElementById(`inp-${type}`).value = val;
    }
  },

  // =================================
  // 6. LOGIC CONTROLLERS
  // =================================
  Controllers: {
    setMode(mode) {
      App.State.mode = mode;
      document.getElementById('map').style.cursor = mode === 'view' ? 'grab' : 'crosshair';
    },

    setPoint(type, loc) { // loc: {lat, lng, name, address}
      App.State[type] = loc;
      App.UI.updateInput(type, loc.name || loc.address || "Точка на карте");

      // Re-draw markers
      App.Map.clearMarkers();
      if (App.State.start) App.Map.addMarker(App.State.start.lat, App.State.start.lng, 'start');
      if (App.State.end) App.Map.addMarker(App.State.end.lat, App.State.end.lng, 'end');

      App.Map.instance.setView([loc.lat, loc.lng], 16);
    },

    handleMapClick(e) {
      const { lat, lng } = e.latlng;
      const loc = { lat, lng, name: `Координаты: ${lat.toFixed(4)}, ${lng.toFixed(4)}` };

      if (App.State.mode === 'select_start') {
        this.setPoint('start', loc);
        this.setMode('view');
      } else if (App.State.mode === 'select_end') {
        this.setPoint('end', loc);
        this.setMode('view');
      } else if (App.State.mode === 'report') {
        this.openReportDialog(loc);
        this.setMode('view');
      }
    },

    async buildRoute() {
      if (!App.State.start || !App.State.end) {
        alert("Выберите обе точки маршрута!");
        return;
      }

      const btn = document.getElementById('btn-go');
      btn.textContent = "Маршрутизация...";
      btn.disabled = true;

      try {
        const route = await App.Router.calculate(App.State.start, App.State.end);
        App.Map.drawRoute(route.coordinates);
      } catch (err) {
        alert(err);
      } finally {
        btn.textContent = "Построить";
        btn.disabled = false;
      }
    },

    reset() {
      App.State.start = null;
      App.State.end = null;
      App.State.routeLayer = null;
      if (App.State.routeLayer) App.State.routeLayer.remove();
      App.Map.clearMarkers();
      App.UI.updateInput('start', '');
      App.UI.updateInput('end', '');
    },

    locateUser() {
  if (!navigator.geolocation) {
    alert("Геолокация не поддерживается");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;

      if (this.userMarker) {
        this.userMarker.remove();
      }

      this.userMarker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          html: '🧍',
          iconSize: [24, 24],
          className: ''
        })
      }).addTo(App.Map.instance);

      App.Map.instance.flyTo([latitude, longitude], 17);
    },
    () => {
      alert("Не удалось получить местоположение");
    }
  );
},

      }
    },

    startReport() {
      App.State.mode = 'report';
      document.getElementById('map').style.cursor = 'help';
      alert("Нажмите на карту, чтобы отметить барьер.");
    },

    openReportDialog(loc) {
      const overlay = App.UI.showModal(`
                <h2>Сообщить о барьере</h2>
                <p style="margin-bottom:1rem;color:#64748b;font-size:0.9rem">Координаты: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</p>
                <textarea rows="4" placeholder="Опишите проблему (например: высокий бордюр, нет пандуса)"></textarea>
                <div class="action-bar">
                    <button class="btn btn-primary" id="btn-send-report">Отправить</button>
                    <button class="btn btn-secondary" id="btn-cancel-report">Отмена</button>
                </div>
            `);

      overlay.querySelector('#btn-cancel-report').onclick = () => overlay.remove();
      overlay.querySelector('#btn-send-report').onclick = () => {
        alert("Спасибо! Ваш отчет принят для обработки.");
        overlay.remove();
      };
    }
  },

  init() {
  this.UI.init();

  // ⬅️ дать браузеру дорисовать DOM
  setTimeout(() => {
    this.Map.init();
    this.Router.init();
  }, 0);
 }
};

// Start Application
document.addEventListener('DOMContentLoaded', () => App.init());
