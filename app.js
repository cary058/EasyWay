/**
 * Accessibility Drones - Stable Release
 */

const App = {

  // ==============================
  // CONFIG
  // ==============================
  Config: {
    center: [51.1280, 71.4304],
    zoom: 15,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  },

  // ==============================
  // STATE
  // ==============================
  State: {
    start: null,
    end: null,
    markers: [],
    userProfile: {
      mobility: 'wheelchair'
    }
  },

  // ==============================
  // MAP
  // ==============================
  Map: {
    instance: null,
    routingControl: null,
    userMarker: null,

    init() {
      this.instance = L.map('map', { zoomControl: false })
        .setView(App.Config.center, App.Config.zoom);

      L.tileLayer(App.Config.tileUrl, {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.instance);

      L.control.zoom({ position: 'bottomright' })
        .addTo(this.instance);
    },

    addMarker(lat, lng, type) {
      const color =
        type === 'start' ? '#22c55e' :
        type === 'end' ? '#ef4444' :
        '#3b82f6';

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${color};
                               width:24px;
                               height:24px;
                               border:3px solid white;
                               border-radius:50%"></div>`,
          iconSize: [24, 24]
        })
      }).addTo(this.instance);

      App.State.markers.push(marker);
    },

    clearMarkers() {
      App.State.markers.forEach(m => m.remove());
      App.State.markers = [];
    },

    drawRoute(start, end) {
      if (this.routingControl) {
        this.routingControl.remove();
      }

      this.routingControl = L.Routing.control({
        waypoints: [
          L.latLng(start.lat, start.lng),
          L.latLng(end.lat, end.lng)
        ],
        router: L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1',
          profile: 'foot'
        }),
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
        lineOptions: {
          styles: [{ color: '#2563eb', weight: 6 }]
        }
      }).addTo(this.instance);
    }
  },

  // ==============================
  // CONTROLLERS
  // ==============================
  Controllers: {

    setPoint(type) {
      App.Map.instance.once('click', (e) => {
        const { lat, lng } = e.latlng;

        App.State[type] = { lat, lng };

        App.Map.clearMarkers();

        if (App.State.start)
          App.Map.addMarker(App.State.start.lat, App.State.start.lng, 'start');

        if (App.State.end)
          App.Map.addMarker(App.State.end.lat, App.State.end.lng, 'end');
      });
    },

    buildRoute() {
      if (!App.State.start || !App.State.end) {
        alert("Выберите две точки на карте");
        return;
      }

      App.Map.drawRoute(App.State.start, App.State.end);
    },

    locateUser() {
      if (!navigator.geolocation) {
        alert("Геолокация не поддерживается");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;

          if (App.Map.userMarker)
            App.Map.userMarker.remove();

          App.Map.userMarker =
            L.marker([latitude, longitude])
              .addTo(App.Map.instance);

          App.Map.instance.flyTo([latitude, longitude], 17);
        },
        () => alert("Разрешите доступ к геолокации"),
        { enableHighAccuracy: true }
      );
    }
  },

  // ==============================
  // INIT
  // ==============================
  init() {
    App.Map.init();

    document.getElementById('btn-start')
      ?.addEventListener('click', () =>
        App.Controllers.setPoint('start'));

    document.getElementById('btn-end')
      ?.addEventListener('click', () =>
        App.Controllers.setPoint('end'));

    document.getElementById('btn-go')
      ?.addEventListener('click', () =>
        App.Controllers.buildRoute());

    document.getElementById('btn-locate')
      ?.addEventListener('click', () =>
        App.Controllers.locateUser());

    document.querySelectorAll('input[name="mobility"]')
      .forEach(radio => {
        radio.addEventListener('change', (e) => {
          App.State.userProfile.mobility = e.target.value;
        });
      });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
