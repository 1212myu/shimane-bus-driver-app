// アプリケーションメインロジック
const App = {
  currentTrip: null,
  clockTimer: null,
  wakeLock: null,

  async init() {
    await GTFS.load();
    this.setupSelectScreen();
    this.setupEventListeners();
    this.registerServiceWorker();
  },

  setupSelectScreen() {
    const today = new Date();
    document.getElementById('today-date').textContent = `今日: ${GTFS.formatDateJP(today)}`;

    const serviceType = GTFS.getServiceType(today);

    if (serviceType === '運休') {
      document.getElementById('service-type').textContent = '全便運休';
      document.getElementById('service-type').style.color = '#FF1744';
      document.getElementById('suspension-notice').classList.remove('hidden');
      return;
    }

    const serviceLabel = serviceType === '平日' ? '平日ダイヤ' : '土日祝ダイヤ';
    document.getElementById('service-type').textContent = `種別: ${serviceLabel}`;

    const tripsByDir = GTFS.getTripsByDirection(today);
    UI.renderTripList(tripsByDir, (trip) => this.startTrip(trip));
  },

  setupEventListeners() {
    document.getElementById('btn-back').addEventListener('click', () => this.stopTrip());
    document.getElementById('btn-complete-back').addEventListener('click', () => {
      UI.hideComplete();
      this.stopTrip();
    });
  },

  startTrip(trip) {
    this.currentTrip = trip;
    Matching.reset(trip);
    UI.showScreen('screen-driving');
    UI.initDrivingScreen(trip);

    // GPS開始
    GPS.onUpdate = (lat, lon, accuracy) => this.onGPSUpdate(lat, lon, accuracy);
    GPS.start();

    // 時計更新（毎秒）
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);

    // Wake Lock
    this.requestWakeLock();

    // GPS精度表示
    this.addGPSIndicator();
  },

  stopTrip() {
    this.currentTrip = null;
    GPS.stop();
    GPS.onUpdate = null;
    Alert.hide();

    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    this.releaseWakeLock();
    this.removeGPSIndicator();

    UI.showScreen('screen-select');
    // 便選択画面を再描画（時刻ハイライト更新）
    this.setupSelectScreen();
  },

  onGPSUpdate(lat, lon, accuracy) {
    // GPS精度表示
    this.updateGPSIndicator(accuracy);

    if (!this.currentTrip) return;

    const result = Matching.updateProgress(lat, lon);
    if (!result) return;

    if (result.status === 'complete') {
      GPS.stop();
      UI.showComplete(this.currentTrip);
      return;
    }

    if (result.status === 'early_warning') {
      Alert.show(result.stop.name, result.scheduledTime);
      // 通常表示も更新
      const state = Matching.getState(lat, lon);
      if (state && state.status === 'driving') {
        this.updateDrivingUI(state);
      }
      return;
    }

    // 早発アラートが出ているが予定時刻を過ぎた場合
    if (Alert.active) {
      // Alert側のintervalで自動解除されるため何もしない
    }

    if (result.status === 'driving') {
      this.updateDrivingUI(result);
    }
  },

  updateDrivingUI(state) {
    UI.updateNextStop(state.nextStop, state.distance);
    UI.updateUpcoming(state.upcoming);
    UI.updatePassed(state.passed);
  },

  updateClock() {
    let statusClass = 'status-on-time';

    if (this.currentTrip && GPS.hasPosition()) {
      const state = Matching.getState(GPS.lat, GPS.lon);
      if (state && state.delay) {
        statusClass = state.delay.color;
      }
    }

    UI.updateClock(statusClass);
  },

  // GPS精度インジケーター
  addGPSIndicator() {
    if (document.querySelector('.gps-accuracy')) return;
    const el = document.createElement('div');
    el.className = 'gps-accuracy';
    el.id = 'gps-indicator';
    el.textContent = 'GPS: 取得中...';
    document.body.appendChild(el);
  },

  removeGPSIndicator() {
    const el = document.getElementById('gps-indicator');
    if (el) el.remove();
  },

  updateGPSIndicator(accuracy) {
    const el = document.getElementById('gps-indicator');
    if (!el) return;
    el.textContent = `GPS: ±${Math.round(accuracy)}m`;
    el.className = accuracy > 50 ? 'gps-accuracy warn' : 'gps-accuracy';
  },

  // Wake Lock（スリープ防止）
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {
      console.warn('Wake Lock failed:', e);
    }
  },

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  },

  // Service Worker登録
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (e) {
        console.warn('SW registration failed:', e);
      }
    }
  }
};

// アプリ起動
document.addEventListener('DOMContentLoaded', () => App.init());
