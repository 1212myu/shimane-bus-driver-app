// 計算カウンター機能（v4: 合算払い対応）
const FareCounter = {
  FARES: [100, 150, 200, 250, 300, 350, 400, 500, 550],
  FARES_COUPON: [100, 150, 200, 300],
  PAYMENT_METHODS: ['現金', '回数券', '定期券', '無料'],

  STORAGE_KEY: 'fare_counter_data',

  // 状態
  records: [],       // [{fare, payment, passenger, time, tripKey, combine}]
  trips: [],         // [{key, label}]
  activeTripKey: null,
  viewingTripKey: null,
  selectedPayment: '現金',
  selectedPassenger: '大人',       // 大人/小人/障がい者
  disabledSubType: '大人',         // 障がい者のサブ区分: 大人/小人
  combineMode: false,              // 合算モード（1回の記録で自動解除）
  initialized: false,

  // --- 運賃計算 ---
  calcFare(baseFare, passenger) {
    if (passenger === '大人') return baseFare;
    // 小人・障がい者(大人): 半額（10円単位切上げ）
    if (passenger === '小人' || passenger === '障がい者') {
      return Math.ceil(baseFare / 2 / 10) * 10;
    }
    // 障がい者(小人): 1/4（10円単位切上げ）
    if (passenger === '障がい者(小人)') {
      return Math.ceil(baseFare / 4 / 10) * 10;
    }
    return baseFare;
  },

  // 実際に記録するpassenger値を返す
  getEffectivePassenger() {
    if (this.selectedPassenger === '障がい者') {
      return this.disabledSubType === '小人' ? '障がい者(小人)' : '障がい者';
    }
    return this.selectedPassenger;
  },

  // 定期券・無料は金額不要のモード
  isCountOnlyMode() {
    return this.selectedPayment === '定期券' || this.selectedPayment === '無料';
  },

  init() {
    // 既に activeTripKey/viewingTripKey が設定されていれば保持（運行中のタブ切替時に
    // loadData で 'outside' に上書きされるのを防ぐ）
    const preservedActive = this.activeTripKey;
    const preservedViewing = this.viewingTripKey;

    this.loadData();

    if (preservedActive) {
      this.activeTripKey = preservedActive;
    }
    if (!this.activeTripKey) {
      this.ensureOutsideTrip();
      this.activeTripKey = 'outside';
    }
    // viewingTripKey は呼び出し側で明示設定されていれば尊重、そうでなければ active に同期
    this.viewingTripKey = preservedViewing || this.activeTripKey;

    if (!this.initialized) {
      this.setupEventListeners();
      this.initialized = true;
    }
    this.updateToggleButtons('.payment-btn', this.selectedPayment);
    this.updateToggleButtons('.ptype-btn', this.selectedPassenger);
    this.updateToggleButtons('.disabled-sub-btn', this.disabledSubType);
    this.render();
  },

  // --- 便連携 ---
  ensureOutsideTrip() {
    if (!this.trips.find(t => t.key === 'outside')) {
      this.trips.unshift({ key: 'outside', label: '便外' });
    }
  },

  linkTrip(trip) {
    const lastStop = trip.stop_times[trip.stop_times.length - 1];
    const key = trip.trip_id;
    const label = `${trip.first_time} ${trip.first_stop}発→${lastStop.name}`;
    if (!this.trips.find(t => t.key === key)) {
      this.trips.push({ key, label });
    }
    this.activeTripKey = key;
    this.viewingTripKey = key;
    // activeTripKey 更新後に保存（順序重要：以前は saveData が先で古い activeTripKey が保存されていた）
    this.saveData();
  },

  finalizeTrip() {
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
        if (this.records.length > 0 && this.records[0].tripIndex !== undefined && !this.records[0].tripKey) {
          this.migrateFromV1(data);
        }
      }
    } catch (e) {
      console.warn('精算データ読み込みエラー:', e);
    }
  },

  migrateFromV1(data) {
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
  addRecord(baseFare) {
    const passenger = this.getEffectivePassenger();
    // 合算モード中は計算せず、運賃ボタンの額をそのまま加算金額とする
    const fare = this.combineMode ? baseFare : this.calcFare(baseFare, passenger);
    const record = {
      fare,
      baseFare,
      payment: this.selectedPayment,
      passenger,
      time: new Date().toISOString(),
      tripKey: this.viewingTripKey
    };
    if (this.combineMode) {
      record.combine = true;
    }
    this.records.push(record);
    // 合算モードは1回の記録で自動解除
    if (this.combineMode) {
      this.combineMode = false;
    }
    this.saveData();
    this.render();
  },

  toggleCombineMode() {
    // 定期券・無料では合算は使わない
    if (this.isCountOnlyMode()) {
      this.combineMode = false;
    } else {
      this.combineMode = !this.combineMode;
    }
    this.render();
  },

  // 定期券・無料用（金額0で人数のみカウント）
  addCountRecord() {
    const passenger = this.selectedPayment; // '定期券' or '無料'
    this.records.push({
      fare: 0,
      baseFare: 0,
      payment: this.selectedPayment,
      passenger,
      time: new Date().toISOString(),
      tripKey: this.viewingTripKey
    });
    this.saveData();
    this.render();
  },

  undoLast() {
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
  // 人数は combine 記録を除く、金額は全レコード合算
  getSummary(records) {
    const summary = {};
    for (const method of this.PAYMENT_METHODS) {
      summary[method] = { count: 0, amount: 0 };
    }
    for (const r of records) {
      if (!r.combine) {
        summary[r.payment].count += 1;
      }
      summary[r.payment].amount += r.fare;
    }
    const totalCount = records.filter(r => !r.combine).length;
    const totalAmount = records.reduce((s, r) => s + r.fare, 0);
    return { byMethod: summary, totalCount, totalAmount };
  },

  getPassengerSummary(records) {
    const cats = { '大人': 0, '小人': 0, '障がい者': 0, '定期券': 0, '無料': 0 };
    for (const r of records) {
      if (r.combine) continue; // 合算は人数に含めない
      if (r.passenger === '大人') cats['大人']++;
      else if (r.passenger === '小人') cats['小人']++;
      else if (r.passenger === '障がい者' || r.passenger === '障がい者(小人)') cats['障がい者']++;
      else if (r.passenger === '定期券') cats['定期券']++;
      else if (r.passenger === '無料') cats['無料']++;
    }
    return cats;
  },

  // --- イベント ---
  setupEventListeners() {
    // +1人ボタン（定期券・無料用）
    document.getElementById('btn-fare-count').addEventListener('click', () => {
      this.addCountRecord();
    });

    // 支払方法
    document.querySelectorAll('.payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPayment = btn.dataset.value;
        // 定期券・無料に切り替えた場合は合算モードを解除
        if (this.isCountOnlyMode()) {
          this.combineMode = false;
        }
        this.updateToggleButtons('.payment-btn', this.selectedPayment);
        this.updateInputMode();
        this.render();
      });
    });

    // 旅客区分
    document.querySelectorAll('.ptype-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPassenger = btn.dataset.value;
        this.updateToggleButtons('.ptype-btn', this.selectedPassenger);
        this.updateDisabledSubVisibility();
      });
    });

    // 障がい者サブ区分
    document.querySelectorAll('.disabled-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.disabledSubType = btn.dataset.value;
        this.updateToggleButtons('.disabled-sub-btn', this.disabledSubType);
      });
    });

    // 合算
    document.getElementById('btn-fare-combine').addEventListener('click', () => this.toggleCombineMode());

    // 取消
    document.getElementById('btn-fare-undo').addEventListener('click', () => this.undoLast());

    // 計算
    document.getElementById('btn-fare-settle').addEventListener('click', () => this.showSettlement());

    // 精算モーダル閉じる
    document.getElementById('btn-settle-close').addEventListener('click', () => {
      document.getElementById('fare-settlement').classList.add('hidden');
    });

    // データクリア
    document.getElementById('btn-fare-clear').addEventListener('click', () => {
      if (confirm('本日の計算データをすべて削除しますか？')) {
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

    // 戻るボタン
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

  // 支払方法に応じて運賃グリッド or +1人ボタンを切替
  updateInputMode() {
    const isCountOnly = this.isCountOnlyMode();
    document.getElementById('fare-grid-area').classList.toggle('hidden', isCountOnly);
    document.getElementById('fare-count-area').classList.toggle('hidden', !isCountOnly);
    document.getElementById('ptype-group').classList.toggle('hidden', isCountOnly);
    document.getElementById('disabled-sub-group').classList.toggle('hidden', true);
    if (!isCountOnly) {
      this.updateDisabledSubVisibility();
      this.renderFareGrid();
    }
  },

  renderFareGrid() {
    const container = document.getElementById('fare-grid-area');
    const fares = this.selectedPayment === '回数券' ? this.FARES_COUPON : this.FARES;
    container.innerHTML = fares.map(f =>
      `<button class="fare-btn" data-fare="${f}">${f}</button>`
    ).join('');
    container.querySelectorAll('.fare-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.addRecord(parseInt(btn.dataset.fare, 10));
      });
    });
  },

  // 障がい者サブ区分の表示切替
  updateDisabledSubVisibility() {
    const show = this.selectedPassenger === '障がい者' && !this.isCountOnlyMode();
    document.getElementById('disabled-sub-group').classList.toggle('hidden', !show);
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

    // ヘッダー
    const labelEl = document.getElementById('fare-trip-label');
    labelEl.textContent = viewTrip ? viewTrip.label : '計算';

    // 人数（合算記録は除く）
    const peopleCount = viewRecords.filter(r => !r.combine).length;
    document.getElementById('fare-trip-count').textContent = `${peopleCount}人`;

    // 直前の入力 or 合算モード表示
    const lastEl = document.getElementById('fare-last-entry');
    if (this.combineMode) {
      lastEl.textContent = '合算入力中';
      lastEl.classList.add('combine-active');
    } else {
      lastEl.classList.remove('combine-active');
      if (viewRecords.length > 0) {
        const last = viewRecords[viewRecords.length - 1];
        const prefix = last.combine ? '直前(合算): ' : '直前: ';
        if (last.fare === 0) {
          lastEl.textContent = `${prefix}${last.passenger}`;
        } else if (last.combine) {
          lastEl.textContent = `${prefix}${last.payment} ${last.fare}円`;
        } else {
          lastEl.textContent = `${prefix}${last.passenger} ${last.fare}円`;
        }
      } else {
        lastEl.textContent = '';
      }
    }

    // 合算ボタンの表示状態
    const combineBtn = document.getElementById('btn-fare-combine');
    if (combineBtn) {
      combineBtn.classList.toggle('active', this.combineMode);
      combineBtn.disabled = this.isCountOnlyMode();
    }

    // 入力モード更新
    this.updateInputMode();

    // 便タブ
    this.renderTripTabs();

    // 集計
    this.renderTripSummary();
  },

  renderTripTabs() {
    const container = document.getElementById('fare-trip-tabs');
    if (!container) return;
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
      const count = this.getRecordsForTrip(t.key).filter(r => !r.combine).length;
      const shortLabel = t.key === 'outside' ? '便外' : t.label.split('発')[0] + '発';
      html += `<button class="fare-trip-tab${isActive ? ' active' : ''}" data-trip-key="${t.key}">
        ${shortLabel}<span class="tab-count">${count}</span>
      </button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.fare-trip-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchToTrip(btn.dataset.tripKey);
      });
    });
  },

  renderTripSummary() {
    const tbody = document.getElementById('fare-summary-body');
    const tripsWithData = this.trips.filter(t => this.getRecordsForTrip(t.key).length > 0);
    let html = '';

    if (tripsWithData.length > 1) {
      for (const t of tripsWithData) {
        const recs = this.getRecordsForTrip(t.key);
        const summary = this.getSummary(recs);
        const label = t.key === 'outside' ? '便外' : t.label.split('発')[0] + '発';
        html += `<tr class="fare-trip-header-row"><td colspan="3">${label}</td></tr>`;
        for (const method of this.PAYMENT_METHODS) {
          const d = summary.byMethod[method];
          if (d.count > 0) {
            const amountStr = d.amount > 0 ? `${d.amount.toLocaleString()}円` : '';
            html += `<tr>
              <td>${method}</td>
              <td>${d.count}人</td>
              <td>${amountStr}</td>
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
      const summary = this.getSummary(this.records);
      for (const method of this.PAYMENT_METHODS) {
        const d = summary.byMethod[method];
        if (d.count > 0) {
          const amountStr = d.amount > 0 ? `${d.amount.toLocaleString()}円` : '';
          html += `<tr>
            <td>${method}</td>
            <td>${d.count}人</td>
            <td>${amountStr}</td>
          </tr>`;
        }
      }
    }

    const allSummary = this.getSummary(this.records);
    html += `<tr class="fare-total-row">
      <td>合計</td>
      <td>${allSummary.totalCount}人</td>
      <td>${allSummary.totalAmount.toLocaleString()}円</td>
    </tr>`;
    tbody.innerHTML = html;
  },

  showSettlement() {
    const container = document.getElementById('settle-body');

    // --- 旅客区分別 ---
    const pSummary = this.getPassengerSummary(this.records);
    let html = `<div class="settle-section">
      <div class="settle-section-title">旅客区分別</div>`;
    const pCats = ['大人', '小人', '障がい者', '定期券', '無料'];
    for (const cat of pCats) {
      if (pSummary[cat] > 0) {
        html += `<div class="settle-row">
          <span>${cat}</span><span>${pSummary[cat]}人</span>
        </div>`;
      }
    }
    html += `<div class="settle-row settle-row-total">
      <span>合計</span><span>${this.records.length}人</span>
    </div></div>`;

    // --- 現金の精算（最重要） ---
    const cashAmount = this.getSummary(this.records).byMethod['現金'].amount;
    html += `<div class="settle-cash-box">
      <div class="settle-cash-label">現金合計</div>
      <div class="settle-cash-amount">${cashAmount.toLocaleString()}円</div>
    </div>`;

    // --- 内訳 ---
    const total = this.getSummary(this.records);
    html += `<div class="settle-section">
      <div class="settle-section-title">内訳</div>`;
    for (const method of this.PAYMENT_METHODS) {
      const d = total.byMethod[method];
      if (d.count > 0) {
        const amountStr = d.amount > 0 ? `${d.amount.toLocaleString()}円` : '';
        html += `<div class="settle-row">
          <span>${method}</span>
          <span>${d.count}人${amountStr ? '  ' + amountStr : ''}</span>
        </div>`;
      }
    }
    html += `</div>`;

    // --- 便別詳細 ---
    const tripsWithData = this.trips.filter(t => this.getRecordsForTrip(t.key).length > 0);
    if (tripsWithData.length > 1) {
      html += `<div class="settle-section">
        <div class="settle-section-title">便別</div>`;
      for (const t of tripsWithData) {
        const recs = this.getRecordsForTrip(t.key);
        const summary = this.getSummary(recs);
        const title = t.key === 'outside' ? '便外' : t.label;
        html += `<div class="settle-trip-detail">
          <div class="settle-trip-name">${title}</div>
          <div class="settle-row">
            <span>${summary.totalCount}人</span>
            <span>${summary.totalAmount.toLocaleString()}円</span>
          </div>
        </div>`;
      }
      html += `</div>`;
    }

    container.innerHTML = html;
    document.getElementById('fare-settlement').classList.remove('hidden');
  }
};
