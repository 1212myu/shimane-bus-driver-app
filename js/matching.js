// バス停マッチングロジック
const Matching = {
  passedStopIndex: -1,
  passedStops: [],
  currentTrip: null,

  reset(trip) {
    this.currentTrip = trip;
    this.passedStopIndex = -1;
    this.passedStops = [];
  },

  // Haversine距離計算（メートル）
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  },

  // GPS位置から進行状況を更新
  updateProgress(lat, lon) {
    if (!this.currentTrip) return null;
    const stops = this.currentTrip.stop_times;
    const now = new Date();

    // 次のバス停（未通過の最初のバス停）
    const nextIdx = this.passedStopIndex + 1;
    if (nextIdx >= stops.length) {
      return { status: 'complete' };
    }

    const nextStop = stops[nextIdx];
    const stopData = GTFS.getStop(nextStop.stop_id);
    if (!stopData) return null;

    const distance = this.haversine(lat, lon, stopData.lat, stopData.lon);

    // 2つ以上先のバス停スキップ補正
    for (let i = nextIdx + 1; i < stops.length; i++) {
      const futureStop = GTFS.getStop(stops[i].stop_id);
      if (futureStop && this.haversine(lat, lon, futureStop.lat, futureStop.lon) <= 100) {
        // スキップされたバス停を通過済みに
        for (let j = nextIdx; j <= i; j++) {
          this.markPassed(j, now);
        }
        if (i + 1 >= stops.length) {
          return { status: 'complete' };
        }
        return this.getState(lat, lon);
      }
    }

    // 次のバス停の半径150m以内に入ったら通過と判定
    if (distance <= 150) {
      const scheduledTime = this.parseTime(nextStop.departure);
      const diffMs = now.getTime() - scheduledTime.getTime();

      // 早発チェック（30秒以上早い場合）
      if (diffMs < -30000) {
        return {
          status: 'early_warning',
          stop: nextStop,
          distance: distance,
          scheduledTime: nextStop.departure,
          diffMs: diffMs
        };
      }

      this.markPassed(nextIdx, now);

      if (nextIdx + 1 >= stops.length) {
        return { status: 'complete' };
      }
    }

    return this.getState(lat, lon);
  },

  markPassed(idx, time) {
    if (idx <= this.passedStopIndex) return;
    const stop = this.currentTrip.stop_times[idx];
    const scheduled = this.parseTime(stop.departure);
    const diff = (time.getTime() - scheduled.getTime()) / 1000;

    this.passedStops.push({
      name: stop.name,
      scheduled: stop.departure,
      actual: this.formatTime(time),
      delaySec: diff
    });
    this.passedStopIndex = idx;
  },

  getState(lat, lon) {
    const stops = this.currentTrip.stop_times;
    const nextIdx = this.passedStopIndex + 1;
    if (nextIdx >= stops.length) {
      return { status: 'complete' };
    }

    const nextStop = stops[nextIdx];
    const stopData = GTFS.getStop(nextStop.stop_id);
    const distance = stopData ? this.haversine(lat, lon, stopData.lat, stopData.lon) : null;

    // 後続バス停（最大3つ）
    const upcoming = [];
    for (let i = nextIdx + 1; i < Math.min(nextIdx + 4, stops.length); i++) {
      upcoming.push(stops[i]);
    }

    // 遅延計算
    const delay = this.calculateDelay(nextStop, distance);

    return {
      status: 'driving',
      nextStop: nextStop,
      distance: distance,
      upcoming: upcoming,
      passed: [...this.passedStops].reverse(),
      delay: delay
    };
  },

  calculateDelay(nextStop, distance) {
    const now = new Date();
    const scheduledTime = this.parseTime(nextStop.departure);

    // 到着予測: 残り距離 / 平均速度（30km/h = 500m/min）
    let estimatedDelaySec;
    if (distance !== null && distance > 150) {
      const travelTimeSec = (distance / 500) * 60;
      const estimatedArrival = new Date(now.getTime() + travelTimeSec * 1000);
      estimatedDelaySec = (estimatedArrival.getTime() - scheduledTime.getTime()) / 1000;
    } else {
      estimatedDelaySec = (now.getTime() - scheduledTime.getTime()) / 1000;
    }

    if (estimatedDelaySec < -60) {
      return { status: 'early', color: 'status-early', delaySec: estimatedDelaySec };
    } else if (estimatedDelaySec <= 60) {
      return { status: 'on_time', color: 'status-on-time', delaySec: estimatedDelaySec };
    } else if (estimatedDelaySec <= 300) {
      return { status: 'slight_delay', color: 'status-slight-delay', delaySec: estimatedDelaySec };
    } else if (estimatedDelaySec <= 600) {
      return { status: 'delay', color: 'status-delay', delaySec: estimatedDelaySec };
    } else {
      return { status: 'heavy_delay', color: 'status-heavy-delay', delaySec: estimatedDelaySec };
    }
  },

  parseTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  },

  formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
};
