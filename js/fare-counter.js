// 精算カウンター機能（v2: 便連携対応）
const FareCounter = {
  FARES: [200, 250, 300, 350, 400, 500, 550],
  PAYMENT_METHODS: ['現金', '回数券', '定期券', '無料'],
  PASSENGER_TYPES: ['大人', '小人', '障がい者'],

  STORAGE_KEY: 'fare_counter_data',

  // 状態
  records: [],       // 全記録 [{fare, payment, passenger, time, tripKey}]
  trips: [],         // 便リスト [{key, label}] — 登録順
  activeTripKey: null,   // 現在入力中の便キー
  viewingTripKey: null,  // 表示中の便キー（タブ切替で過去便も編集可能）
  selectedPayment: '現金',
  selectedPassenger: '大人',
  initialized: false,

  init() {
    this.loadData();
    // activeTripKey がなければ便外を設定
    if (!this.activeTripKey) {
      this.ensureOutsideTrip();
      this.activeTripKey = 'outside';
    }
    // 表示中の便 = アクティブ便
    this.viewingTripKey = this.activeTripKey;

    if (!this.initialized) {
      this.setupEventListeners();
      this.initialized = true;
    }
    this.updateToggleButtons('.payment-btn', this.selectedPayment);
    this.updateToggleButtons('.ptype-btn', this.selectedPassenger);
    this.render();
  },

  // --- 便連携 ---

  // 便外エントリを確保
  ensureOutsideTrip() {
    if (!this.trips.find(t => t.key === 'outside')) {
      this.trips.unshift({ key: 'outside', label: '便外' });
    }
  },

  // 運行開始時に呼ばれる
  linkTrip(trip) {
    const lastStop = trip.stop_times[trip.stop_times.length - 1];
    const key = trip.trip_id;
    const label = `${trip.first_time} ${trip.first_stop}発→${lastStop.name}`;
    // 既に同じ便があれば追加しない（再開時など）
    if (!this.trips.find(t => t.key === key)) {
      this.trips.push({ key, label });
      this.saveData();
    }
    this.activeTripKey = key;
    this.viewingTripKey = key;
  },

  // 運行完了/便選択に戻る時に呼ばれる
  finalizeTrip() {
    // 便外に戻す
    this.ensureOutsideTrip();
    this.activeTripKey = 'outside';
    this.viewingTripKey = 'outside';
    this.saveData();
  },

  // --- データ永続化 ---
  loadData() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        this.records = data.records || [];
        this.trips = data.trips || [];
        this.activeTripKey = data.activeTripKey || null;
        // v1→v2マイグレーション: tripIndex → tripKey
        if (this.records.length > 0 && this.records[0].tripIndex !== undefined && !this.records[0].tripKey) {
          this.migrateFromV1(data);
        }
      }
    } catch (e) {
      console.warn('精算データ読み込みエラー:', e);
    }
  },

  migrateFromV1(data) {
    // v1の tripIndex ベースのデータをv2に変換
    const maxIdx = (data.tripIndex || 0);
    this.trips = [];
    for (let i = 0; i <= maxIdx; i++) {
      this.trips.push({ key: `legacy_${i}`, label: `第${i + 1}便` });
    }
    for (const r of this.records) {
      r.tripKey = `legacy_${r.tripIndex || 0}`;
      delete r.tripIndex;
    }
    this.activeTripKey = `legacy_${maxIdx}`;
    this.saveData();
  },

  saveData() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
      records: this.records,
      trips: this.trips,
      activeTripKey: this.activeTripKey,
      savedAt: new Date().toISOString()
    }));
  },

  // --- 操作 ---
  addRecord(fare) {
    this.records.push({
      fare,
      payment: this.selectedPayment,
      passenger: this.selectedPassenger,
      time: new Date().toISOString(),
      tripKey: this.viewingTripKey
    });
    this.saveData();
    this.render();
  },

  undoLast() {
    // 表示中の便の最後のレコードを取消
    // records配列を逆順に探して該当便の最後のレコードを削除
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i].tripKey === this.viewingTripKey) {
        this.records.splice(i, 1);
        this.saveData();
        this.render();
        return;
      }
    }
  },

  getRecordsForTrip(tripKey) {
    return this.records.filter(r => r.tripKey === tripKey);
  },

  // --- 集計 ---
  getSummary(records) {
    const summary = {};
    for (const method of this.PAYMENT_METHODS) {
      summary[method] = { count: 0, amount: 0 };
    }
    for (const r of records) {
      summary[r.payment].count += 1;
      summary[r.payment].amount += r.fare;
    }
    const totalCount = records.length;
    const totalAmount = records.reduce((s, r) => s + r.fare, 0);
    return { byMethod: summary, totalCount, totalAmount };
  },

  // --- イベント ---
  setupEventListeners() {
    // 運賃ボタン
    document.querySelectorAll('.fare-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fare = parseInt(btn.dataset.fare, 10);
        this.addRecord(fare);
      });
    });

    // 支払方法
    document.querySelectorAll('.payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPayment = btn.dataset.value;
        this.updateToggleButtons('.payment-btn', this.selectedPayment);
      });
    });

    // 旅客区分
    document.querySelectorAll('.ptype-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPassenger = btn.dataset.value;
        this.updateToggleButtons('.ptype-btn', this.selectedPassenger);
      });
    });

    // 取消ボタン
    document.getElementById('btn-fare-undo').addEventListener('click', () => this.undoLast());

    // 精算ボタン
    document.getElementById('btn-fare-settle').addEventListener('click', () => this.showSettlement());

    // 精算モーダルを閉じる
    document.getElementById('btn-settle-close').addEventListener('click', () => {
      document.getElementById('fare-settlement').classList.add('hidden');
    });

    // データクリア
    document.getElementById('btn-fare-clear').addEventListener('click', () => {
      if (confirm('本日の精算データをすべて削除しますか？')) {
        this.records = [];
        this.trips = [];
        this.activeTripKey = null;
        this.ensureOutsideTrip();
        this.activeTripKey = 'outside';
        this.viewingTripKey = 'outside';
        this.saveData();
        this.render();
      }
    });

    // 戻るボタン（運行中なら運行画面へ、それ以外は便選択へ）
    document.getElementById('btn-fare-back').addEventListener('click', () => {
      if (App.currentTrip) {
        App.switchToDriving();
      } else {
        UI.showScreen('screen-select');
      }
    });
  },

  updateToggleButtons(selector, activeValue) {
    document.querySelectorAll(selector).forEach(b => {
      b.classList.toggle('active', b.dataset.value === activeValue);
    });
  },

  // --- 便タブ切替 ---
  switchToTrip(tripKey) {
    this.viewingTripKey = tripKey;
    this.render();
  },

  // --- 描画 ---
  render() {
    const viewKey = this.viewingTripKey;
    const viewTrip = this.trips.find(t => t.key === viewKey);
    const viewRecords = this.getRecordsForTrip(viewKey);
    const viewSummary = this.getSummary(viewRecords);

    // ヘッダーに便情報表示
    const labelEl = document.getElementById('fare-trip-label');
    if (viewTrip) {
      labelEl.textContent = viewTrip.label;
    } else {
      labelEl.textContent = '精算';
    }

    // 現在便の人数
    document.getElementById('fare-trip-count').textContent = `${viewRecords.length}人`;

    // 直前の入力表示
    const lastEl = document.getElementById('fare-last-entry');
    if (viewRecords.length > 0) {
      const last = viewRecords[viewRecords.length - 1];
      lastEl.textContent = `直前: ${last.fare}円 ${last.payment} ${last.passenger}`;
    } else {
      lastEl.textContent = '';
    }

    // 便タブ描画
    this.renderTripTabs();

    // 便別集計表示
    this.renderTripSummary();
  },

  renderTripTabs() {
    const container = document.getElementById('fare-trip-tabs');
    if (!container) return;
    // レコードがある便 + アクティブ便を表示
    const tripsToShow = this.trips.filter(t =>
      t.key === this.activeTripKey || this.getRecordsForTrip(t.key).length > 0
    );

    if (tripsToShow.length <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    for (const t of tripsToShow) {
      const isActive = t.key === this.viewingTripKey;
      const count = this.getRecordsForTrip(t.key).length;
      const shortLabel = t.key === 'outside' ? '便外' : t.label.split('発')[0] + '発';
      html += `<button class="fare-trip-tab${isActive ? ' active' : ''}" data-trip-key="${t.key}">
        ${shortLabel}<span class="tab-count">${count}</span>
      </button>`;
    }
    container.innerHTML = html;

    // タブクリックイベント
    container.querySelectorAll('.fare-trip-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchToTrip(btn.dataset.tripKey);
      });
    });
  },

  renderTripSummary() {
    const tbody = document.getElementById('fare-summary-body');

    // 便別サマリー
    const tripsWithData = this.trips.filter(t => this.getRecordsForTrip(t.key).length > 0);
    let html = '';

    if (tripsWithData.length > 1) {
      // 複数便ある場合：便ごとに小計行を表示
      for (const t of tripsWithData) {
        const recs = this.getRecordsForTrip(t.key);
        const summary = this.getSummary(recs);
        const label = t.key === 'outside' ? '便外' : t.label.split('発')[0] + '発';
        html += `<tr class="fare-trip-header-row"><td colspan="3">${label}</td></tr>`;
        for (const method of this.PAYMENT_METHODS) {
          const d = summary.byMethod[method];
          if (d.count > 0) {
            html += `<tr>
              <td>${method}</td>
              <td>${d.count}人</td>
              <td>${d.amount.toLocaleString()}円</td>
            </tr>`;
          }
        }
        html += `<tr class="fare-subtotal-row">
          <td>小計</td>
          <td>${summary.totalCount}人</td>
          <td>${summary.totalAmount.toLocaleString()}円</td>
        </tr>`;
      }
    } else if (tripsWithData.length === 1) {
      // 1便のみ：支払方法別のみ
      const summary = this.getSummary(this.records);
      for (const method of this.PAYMENT_METHODS) {
        const d = summary.byMethod[method];
        if (d.count > 0) {
          html += `<tr>
            <td>${method}</td>
            <td>${d.count}人</td>
            <td>${d.amount.toLocaleString()}円</td>
          </tr>`;
        }
      }
    }

    // 全体合計
    const allSummary = this.getSummary(this.records);
    html += `<tr class="fare-total-row">
      <td>合計</td>
      <td>${allSummary.totalCount}人</td>
      <td>${allSummary.totalAmount.toLocaleString()}円</td>
    </tr>`;
    tbody.innerHTML = html;
  },

  showSettlement() {
    // 便ごとの小計
    let tripHtml = '';
    for (const t of this.trips) {
      const recs = this.getRecordsForTrip(t.key);
      if (recs.length === 0) continue;
      const summary = this.getSummary(recs);
      const title = t.key === 'outside' ? '便外' : t.label;
      tripHtml += `<div class="settle-trip">
        <div class="settle-trip-title">${title}（${summary.totalCount}人）</div>`;
      for (const method of this.PAYMENT_METHODS) {
        const d = summary.byMethod[method];
        if (d.count > 0) {
          tripHtml += `<div class="settle-row">
            <span>${method}</span>
            <span>${d.count}人 / ${d.amount.toLocaleString()}円</span>
          </div>`;
        }
      }
      tripHtml += `</div>`;
    }

    // 全体合計
    const total = this.getSummary(this.records);
    const cashTotal = total.byMethod['現金'].amount;

    document.getElementById('settle-trips').innerHTML = tripHtml;
    document.getElementById('settle-total-count').textContent = `${total.totalCount}人`;
    document.getElementById('settle-total-amount').textContent = `${total.totalAmount.toLocaleString()}円`;
    document.getElementById('settle-cash-amount').textContent = `${cashTotal.toLocaleString()}円`;

    document.getElementById('fare-settlement').classList.remove('hidden');
  }
};
