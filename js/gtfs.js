// GTFSデータの読み込みとダイヤ種別判定
const GTFS = {
  stops: [],
  trips: [],
  calendar: null,

  async load() {
    const [stopsRes, tripsRes, calRes] = await Promise.all([
      fetch('data/stops.json'),
      fetch('data/trips.json'),
      fetch('data/calendar.json')
    ]);
    this.stops = await stopsRes.json();
    this.trips = await tripsRes.json();
    this.calendar = await calRes.json();

    // stopsをidで引けるMapを作成
    this.stopsMap = new Map();
    for (const s of this.stops) {
      this.stopsMap.set(s.id, s);
    }
  },

  getStop(id) {
    return this.stopsMap.get(id);
  },

  // ダイヤ種別判定
  getServiceType(date) {
    const dateStr = this.formatDate(date);
    const exc = this.calendar.exceptions[dateStr];

    // 全便運休チェック
    if (exc && exc['全便運休']) {
      return '運休';
    }

    // 例外日チェック（祝日など）
    if (exc) {
      if (exc['土日祝'] === 'add') return '土日祝';
      if (exc['平日'] === 'add') return '平日';
    }

    // 曜日で判定
    const day = date.getDay();
    if (day === 0 || day === 6) {
      return '土日祝';
    }
    return '平日';
  },

  // 該当サービスの便一覧を取得
  getTripsForDate(date) {
    const serviceType = this.getServiceType(date);
    if (serviceType === '運休') return [];
    return this.trips.filter(t => t.service_id === serviceType);
  },

  // 方面別にグループ化
  getTripsByDirection(date) {
    const trips = this.getTripsForDate(date);
    const kawatsu = trips.filter(t => t.direction === '川津方面');
    const noi = trips.filter(t => t.direction === '野井・沖泊方面');

    // 発車時刻順にソート
    const sortByTime = (a, b) => a.first_time.localeCompare(b.first_time);
    kawatsu.sort(sortByTime);
    noi.sort(sortByTime);

    return { kawatsu, noi };
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  },

  formatDateJP(date) {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = weekdays[date.getDay()];
    return `${y}年${m}月${d}日(${w})`;
  }
};
