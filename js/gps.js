// GPS位置取得・管理
const GPS = {
  lat: null,
  lon: null,
  accuracy: null,
  watchId: null,
  lastUpdate: null,
  onUpdate: null,

  start() {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lat = pos.coords.latitude;
        this.lon = pos.coords.longitude;
        this.accuracy = pos.coords.accuracy;
        this.lastUpdate = new Date();
        if (this.onUpdate) this.onUpdate(this.lat, this.lon, this.accuracy);
      },
      (err) => {
        console.warn('GPS error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );
  },

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  },

  hasPosition() {
    return this.lat !== null && this.lon !== null;
  }
};
