// 計算カウンター（v6: タリー方式 + 旅客区分対応）
const FareCounter = {
  CASH_FARES: [200, 250, 300, 350, 400, 500, 550],
  OTHER_CATS: ['回数券', '定期券', '無料'],
  STORAGE_KEY: 'fare_counter_data',

  tripData: {},
  trips: [],
  activeTripKey: null,
  viewingTripKey: null,
  selectedPtype: '大人',
  disabledSub: '大人',
  initialized: false,

  newTripData() {
    return { cashFares: {}, coupon: 0, pass: 0, free: 0, cashSupp: 0, history: [] };
  },

  getTripData(key) {
    if (!this.tripData[key]) this.tripData[key] = this.newTripData();
    return this.tripData[key];
  },

  // --- 便連携（app.js から呼ばれる） ---
  init() {
    const preservedActive = this.activeTripKey;
    const preservedViewing = this.viewingTripKey;
    this.loadData();
    if (preservedActive) this.activeTripKey = preservedActive;
    if (!this.activeTripKey) {
      this.ensureOutsideTrip();
      this.activeTripKey = 'outside';
    }
    this.viewingTripKey = preservedViewing || this.activeTripKey;
    if (!this.initialized) {
      this.setupEventListeners();
      this.initialized = true;
    }
    this.render();
  },

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
    this.saveData();
  },

  finalizeTrip() {
    this.ensureOutsideTrip();
    this.activeTripKey = 'outside';
    this.viewingTripKey = 'outside';
    this.saveData();
  },

  loadData() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return;
      const data = JSON.parse(saved);
      if (data.version === 5) {
        this.tripData = data.tripData || {};
        this.trips = data.trips || [];
        this.activeTripKey = data.activeTripKey || null;
      } else {
        // v4以前のデータはクリア（構造が異なるため）
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (e) {
      console.warn('計算データ読み込みエラー:', e);
    }
  },

  saveData() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
      version: 5,
      tripData: this.tripData,
      trips: this.trips,
      activeTripKey: this.activeTripKey,
      savedAt: new Date().toISOString()
    }));
  },

  // --- 運賃計算 ---
  calcFare(baseFare) {
    const ptype = this.getEffectivePtype();
    if (ptype === '大人') return baseFare;
    if (ptype === '小人' || ptype === '障がい者') return Math.ceil(baseFare / 2 / 10) * 10;
    if (ptype === '障がい者小人') return Math.ceil(baseFare / 4 / 10) * 10;
    return baseFare;
  },

  getEffectivePtype() {
    if (this.selectedPtype === '障がい者') {
      return this.disabledSub === '小人' ? '障がい者小人' : '障がい者';
    }
    return this.selectedPtype;
  },

  // --- 操作 ---
  addCash(baseFare) {
    const ptype = this.getEffectivePtype();
    const actualFare = this.calcFare(baseFare);
    const td = this.getTripData(this.viewingTripKey);
    td.cashFares[actualFare] = (td.cashFares[actualFare] || 0) + 1;
    td.history.push({ type: 'cash', fare: actualFare, baseFare, ptype });

    // 旅客区分別カウント
    if (!td.ptypeCounts) td.ptypeCounts = {};
    td.ptypeCounts[ptype] = (td.ptypeCounts[ptype] || 0) + 1;

    this.saveData();

    // 大人以外は自動リセット
    if (this.selectedPtype !== '大人') {
      this.selectedPtype = '大人';
      this.disabledSub = '大人';
      this.updatePtypeUI();
    }
    this.render();
  },

  addOther(cat) {
    const td = this.getTripData(this.viewingTripKey);
    if (cat === '回数券') td.coupon++;
    else if (cat === '定期券') td.pass++;
    else if (cat === '無料') td.free++;
    td.history.push({ type: 'other', cat });

    if (!td.ptypeCounts) td.ptypeCounts = {};
    const ptype = cat;
    td.ptypeCounts[ptype] = (td.ptypeCounts[ptype] || 0) + 1;

    this.saveData();
    this.render();
  },

  addSupplement() {
    const td = this.getTripData(this.viewingTripKey);
    td.cashSupp += 10;
    td.history.push({ type: 'supp' });
    this.saveData();
    this.render();
  },

  undo() {
    const td = this.getTripData(this.viewingTripKey);
    const last = td.history.pop();
    if (!last) return;
    if (last.type === 'cash') {
      td.cashFares[last.fare] = Math.max(0, (td.cashFares[last.fare] || 0) - 1);
      if (last.ptype && td.ptypeCounts) {
        td.ptypeCounts[last.ptype] = Math.max(0, (td.ptypeCounts[last.ptype] || 0) - 1);
      }
    } else if (last.type === 'other') {
      if (last.cat === '回数券') td.coupon = Math.max(0, td.coupon - 1);
      else if (last.cat === '定期券') td.pass = Math.max(0, td.pass - 1);
      else if (last.cat === '無料') td.free = Math.max(0, td.free - 1);
      if (td.ptypeCounts) {
        td.ptypeCounts[last.cat] = Math.max(0, (td.ptypeCounts[last.cat] || 0) - 1);
      }
    } else if (last.type === 'supp') {
      td.cashSupp = Math.max(0, td.cashSupp - 10);
    }
    this.saveData();
    this.render();
  },

  // --- 集計 ---
  getCashTotal(key) {
    const td = this.getTripData(key);
    let total = 0;
    for (const [fare, count] of Object.entries(td.cashFares)) {
      total += parseInt(fare) * count;
    }
    return total + td.cashSupp;
  },

  getPassengerCount(key) {
    const td = this.getTripData(key);
    let count = 0;
    for (const c of Object.values(td.cashFares)) count += c;
    count += td.coupon + td.pass + td.free;
    return count;
  },

  getAllCashTotal() {
    let total = 0;
    for (const key of Object.keys(this.tripData)) {
      total += this.getCashTotal(key);
    }
    return total;
  },

  getAllPassengerCount() {
    let total = 0;
    for (const key of Object.keys(this.tripData)) {
      total += this.getPassengerCount(key);
    }
    return total;
  },

  updatePtypeUI() {
    document.querySelectorAll('.ptype-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.ptype === this.selectedPtype)
    );
    document.querySelectorAll('.dsub-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.dsub === this.disabledSub)
    );
    const dsubEl = document.getElementById('disabled-sub');
    dsubEl.classList.toggle('hidden', this.selectedPtype !== '障がい者');

    const indicator = document.getElementById('ptype-indicator');
    if (this.selectedPtype === '大人') {
      indicator.textContent = '';
    } else if (this.selectedPtype === '障がい者') {
      const sub = this.disabledSub === '小人' ? '障がい者小人: ¼' : '障がい者: ½';
      indicator.textContent = ` （${sub}）`;
    } else {
      indicator.textContent = ` （${this.selectedPtype}: ½）`;
    }
  },

  // --- イベント ---
  setupEventListeners() {
    // 旅客区分
    document.querySelectorAll('.ptype-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPtype = btn.dataset.ptype;
        this.disabledSub = '大人';
        this.updatePtypeUI();
        this.render();
      });
    });
    document.querySelectorAll('.dsub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.disabledSub = btn.dataset.dsub;
        this.updatePtypeUI();
        this.render();
      });
    });

    document.getElementById('btn-supp-10').addEventListener('click', () => this.addSupplement());
    document.getElementById('btn-fare-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-fare-settle').addEventListener('click', () => this.showSettlement());
    document.getElementById('btn-settle-close').addEventListener('click', () => {
      document.getElementById('fare-settlement').classList.add('hidden');
    });
    document.getElementById('btn-fare-clear').addEventListener('click', () => {
      if (confirm('本日の計算データをすべて削除しますか？')) {
        this.tripData = {};
        this.trips = [];
        this.activeTripKey = null;
        this.ensureOutsideTrip();
        this.activeTripKey = 'outside';
        this.viewingTripKey = 'outside';
        this.saveData();
        this.render();
      }
    });
    document.getElementById('btn-fare-back').addEventListener('click', () => {
      if (App.currentTrip) {
        App.switchToDriving();
      } else {
        UI.showScreen('screen-select');
      }
    });
  },

  // --- 描画 ---
  render() {
    const key = this.viewingTripKey;
    const td = this.getTripData(key);
    const trip = this.trips.find(t => t.key === key);

    // ヘッダー
    document.getElementById('fare-trip-label').textContent = trip ? trip.label : '計算';

    // 現金合計
    document.getElementById('fare-cash-total').textContent =
      `${this.getCashTotal(key).toLocaleString()}円`;

    // 端数
    document.getElementById('supp-amount').textContent =
      `端数: ${td.cashSupp}円`;

    // 現金タリー（旅客区分に応じて表示金額を変更）
    this.renderTallyGrid('tally-cash-grid', this.CASH_FARES.map(baseFare => {
      const actualFare = this.calcFare(baseFare);
      const count = td.cashFares[actualFare] || 0;
      const isDiscounted = this.selectedPtype !== '大人';
      const label = isDiscounted ? `${baseFare}→${actualFare}円` : `${baseFare}円`;
      return {
        label,
        count,
        sub: `${(count * actualFare).toLocaleString()}円`,
        action: () => this.addCash(baseFare),
        discounted: isDiscounted
      };
    }));

    // その他タリー
    const otherItems = [
      { label: '回数券', count: td.coupon, sub: '', action: () => this.addOther('回数券') },
      { label: '定期券', count: td.pass, sub: '', action: () => this.addOther('定期券') },
      { label: '無料', count: td.free, sub: '', action: () => this.addOther('無料') }
    ];
    this.renderTallyGrid('tally-other-grid', otherItems);

    // 便タブ
    this.renderTripTabs();
  },

  renderTallyGrid(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = items.map(item => `
      <button class="tally-card${item.count > 0 ? ' has-count' : ''}${item.discounted ? ' discounted' : ''}">
        <span class="tally-label">${item.label}</span>
        <span class="tally-count">${item.count}</span>
        <span class="tally-sub">${item.sub}</span>
      </button>
    `).join('');
    container.querySelectorAll('.tally-card').forEach((btn, i) => {
      btn.addEventListener('click', items[i].action);
    });
  },

  renderTripTabs() {
    const container = document.getElementById('fare-trip-tabs');
    if (!container) return;
    const tripsToShow = this.trips.filter(t =>
      t.key === this.activeTripKey || this.getPassengerCount(t.key) > 0
    );
    if (tripsToShow.length <= 1) { container.innerHTML = ''; return; }

    container.innerHTML = tripsToShow.map(t => {
      const isActive = t.key === this.viewingTripKey;
      const count = this.getPassengerCount(t.key);
      const shortLabel = t.key === 'outside' ? '便外' : t.label.split('発')[0] + '発';
      return `<button class="fare-trip-tab${isActive ? ' active' : ''}" data-trip-key="${t.key}">
        ${shortLabel}<span class="tab-count">${count}</span>
      </button>`;
    }).join('');

    container.querySelectorAll('.fare-trip-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewingTripKey = btn.dataset.tripKey;
        this.render();
      });
    });
  },

  showSettlement() {
    const container = document.getElementById('settle-body');
    let html = '';

    // 現金合計（最重要）
    const allCash = this.getAllCashTotal();
    html += `<div class="settle-cash-box">
      <div class="settle-cash-label">現金合計</div>
      <div class="settle-cash-amount">${allCash.toLocaleString()}円</div>
    </div>`;

    // 運賃区分別
    html += '<div class="settle-section"><div class="settle-section-title">運賃区分別</div>';
    for (const fare of this.CASH_FARES) {
      let totalCount = 0;
      for (const td of Object.values(this.tripData)) {
        totalCount += td.cashFares[fare] || 0;
      }
      if (totalCount > 0) {
        html += `<div class="settle-row">
          <span>${fare}円</span>
          <span>${totalCount}人 … ${(fare * totalCount).toLocaleString()}円</span>
        </div>`;
      }
    }
    let totalSupp = 0;
    for (const td of Object.values(this.tripData)) totalSupp += td.cashSupp;
    if (totalSupp > 0) {
      html += `<div class="settle-row"><span>端数（合算分）</span><span>${totalSupp.toLocaleString()}円</span></div>`;
    }
    html += '</div>';

    // その他
    let totalCoupon = 0, totalPass = 0, totalFree = 0;
    for (const td of Object.values(this.tripData)) {
      totalCoupon += td.coupon;
      totalPass += td.pass;
      totalFree += td.free;
    }
    if (totalCoupon > 0 || totalPass > 0 || totalFree > 0) {
      html += '<div class="settle-section"><div class="settle-section-title">その他</div>';
      if (totalCoupon > 0) html += `<div class="settle-row"><span>回数券</span><span>${totalCoupon}人</span></div>`;
      if (totalPass > 0) html += `<div class="settle-row"><span>定期券</span><span>${totalPass}人</span></div>`;
      if (totalFree > 0) html += `<div class="settle-row"><span>無料</span><span>${totalFree}人</span></div>`;
      html += '</div>';
    }

    // 旅客区分別
    const ptypeAll = {};
    for (const td of Object.values(this.tripData)) {
      for (const [pt, c] of Object.entries(td.ptypeCounts || {})) {
        if (c > 0) ptypeAll[pt] = (ptypeAll[pt] || 0) + c;
      }
    }
    if (Object.keys(ptypeAll).length > 0) {
      html += '<div class="settle-section"><div class="settle-section-title">旅客区分別</div>';
      for (const [pt, c] of Object.entries(ptypeAll)) {
        html += `<div class="settle-row"><span>${pt}</span><span>${c}人</span></div>`;
      }
      html += '</div>';
    }

    // 合計
    const allCount = this.getAllPassengerCount();
    html += `<div class="settle-section"><div class="settle-row settle-row-total">
      <span>乗客合計</span><span>${allCount}人</span>
    </div></div>`;

    // 便別（複数便の場合）
    const tripsWithData = this.trips.filter(t => this.getPassengerCount(t.key) > 0);
    if (tripsWithData.length > 1) {
      html += '<div class="settle-section"><div class="settle-section-title">便別</div>';
      for (const t of tripsWithData) {
        const title = t.key === 'outside' ? '便外' : t.label;
        const cash = this.getCashTotal(t.key);
        const count = this.getPassengerCount(t.key);
        html += `<div class="settle-trip-detail">
          <div class="settle-trip-name">${title}</div>
          <div class="settle-row"><span>${count}人</span><span>現金 ${cash.toLocaleString()}円</span></div>
        </div>`;
      }
      html += '</div>';
    }

    container.innerHTML = html;
    document.getElementById('fare-settlement').classList.remove('hidden');
  }
};
