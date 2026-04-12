// 精算カウンター機能
const FareCounter = {
  FARES: [200, 250, 300, 350, 400, 500, 550],
  PAYMENT_METHODS: ['現金', '回数券', '定期券', '無料'],
  PASSENGER_TYPES: ['大人', '小人', '障がい者'],

  STORAGE_KEY: 'fare_counter_data',

  // 状態
  records: [],       // 全記録 [{fare, payment, passenger, time, tripIndex}]
  tripIndex: 0,      // 現在の便番号
  selectedPayment: '現金',
  selectedPassenger: '大人',
  initialized: false,

  init() {
    this.loadData();
    if (!this.initialized) {
      this.setupEventListeners();
      this.initialized = true;
    }
    this.updateToggleButtons('.payment-btn', this.selectedPayment);
    this.updateToggleButtons('.ptype-btn', this.selectedPassenger);
    this.render();
  },

  // --- データ永続化 ---
  loadData() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        this.records = data.records || [];
        this.tripIndex = data.tripIndex || 0;
      }
    } catch (e) {
      console.warn('精算データ読み込みエラー:', e);
    }
  },

  saveData() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
      records: this.records,
      tripIndex: this.tripIndex,
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
      tripIndex: this.tripIndex
    });
    this.saveData();
    this.render();
  },

  undoLast() {
    if (this.records.length === 0) return;
    this.records.pop();
    this.saveData();
    this.render();
  },

  nextTrip() {
    if (this.getCurrentTripRecords().length === 0 && this.records.length > 0) return;
    this.tripIndex++;
    this.saveData();
    this.render();
  },

  getCurrentTripRecords() {
    return this.records.filter(r => r.tripIndex === this.tripIndex);
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

    // 便区切り
    document.getElementById('btn-fare-next-trip').addEventListener('click', () => this.nextTrip());

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
        this.tripIndex = 0;
        this.saveData();
        this.render();
      }
    });

    // 戻るボタン
    document.getElementById('btn-fare-back').addEventListener('click', () => {
      UI.showScreen('screen-select');
    });
  },

  updateToggleButtons(selector, activeValue) {
    document.querySelectorAll(selector).forEach(b => {
      b.classList.toggle('active', b.dataset.value === activeValue);
    });
  },

  // --- 描画 ---
  render() {
    // 現在の便の記録
    const tripRecords = this.getCurrentTripRecords();
    const tripSummary = this.getSummary(tripRecords);

    // 便番号
    document.getElementById('fare-trip-label').textContent = `第${this.tripIndex + 1}便`;

    // 現在便の人数
    document.getElementById('fare-trip-count').textContent = `${tripRecords.length}人`;

    // 直前の入力表示
    const lastEl = document.getElementById('fare-last-entry');
    if (tripRecords.length > 0) {
      const last = tripRecords[tripRecords.length - 1];
      lastEl.textContent = `直前: ${last.fare}円 ${last.payment} ${last.passenger}`;
    } else {
      lastEl.textContent = '';
    }

    // 1日の集計テーブル
    this.renderDailySummary();
  },

  renderDailySummary() {
    const allSummary = this.getSummary(this.records);
    const tbody = document.getElementById('fare-summary-body');

    let html = '';
    for (const method of this.PAYMENT_METHODS) {
      const d = allSummary.byMethod[method];
      if (d.count > 0) {
        html += `<tr>
          <td>${method}</td>
          <td>${d.count}人</td>
          <td>${d.amount.toLocaleString()}円</td>
        </tr>`;
      }
    }
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
    for (let i = 0; i <= this.tripIndex; i++) {
      const recs = this.records.filter(r => r.tripIndex === i);
      if (recs.length === 0) continue;
      const summary = this.getSummary(recs);
      tripHtml += `<div class="settle-trip">
        <div class="settle-trip-title">第${i + 1}便（${summary.totalCount}人）</div>`;
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
