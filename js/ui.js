// 画面表示更新
const UI = {
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },

  // 便選択画面の表示
  renderTripList(tripsByDir, onSelect) {
    const container = document.getElementById('trip-list');
    container.innerHTML = '';

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 現在時刻に最も近い次の便を見つける
    let closestTrip = null;
    let closestDiff = Infinity;
    const allTrips = (tripsByDir.groups || []).flatMap(g => g.trips);
    for (const t of allTrips) {
      const [h, m] = t.first_time.split(':').map(Number);
      const tripMin = h * 60 + m;
      const diff = tripMin - nowMin;
      if (diff >= -10 && diff < closestDiff) {
        closestDiff = diff;
        closestTrip = t.trip_id;
      }
    }

    // 方面別にグループ表示
    for (const g of (tripsByDir.groups || [])) {
      if (g.trips.length === 0) continue;
      const group = document.createElement('div');
      group.className = 'direction-group';
      group.innerHTML = `<div class="direction-title">── ${g.name}行 ──</div>`;
      for (const trip of g.trips) {
        group.appendChild(this.createTripButton(trip, closestTrip, onSelect));
      }
      container.appendChild(group);
    }

    // ハイライトされた便まで自動スクロール
    requestAnimationFrame(() => {
      const highlighted = container.querySelector('.trip-btn.highlight');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  },

  createTripButton(trip, closestTrip, onSelect) {
    const btn = document.createElement('button');
    btn.className = 'trip-btn';
    if (trip.trip_id === closestTrip) btn.classList.add('highlight');

    const lastStop = trip.stop_times[trip.stop_times.length - 1];
    btn.innerHTML = `
      <div class="trip-time">${trip.first_time} ${trip.first_stop}発</div>
      <div class="trip-route">→ ${lastStop.name}（${trip.stop_times.length}停留所）</div>
    `;
    btn.addEventListener('click', () => onSelect(trip));
    return btn;
  },

  // 運行支援画面の初期化
  initDrivingScreen(trip) {
    const lastStop = trip.stop_times[trip.stop_times.length - 1];
    document.getElementById('route-info').textContent =
      `島根：${trip.direction} ${trip.first_time}発→${lastStop.name}`;

    // 初期状態：最初のバス停を表示
    this.updateNextStop(trip.stop_times[0], null);
    this.updateUpcoming(trip.stop_times.slice(1, 4));
    document.getElementById('passed-stops').innerHTML = '';
  },

  // 時計更新
  updateClock(statusClass) {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');

    const clock = document.getElementById('clock');
    clock.textContent = `${h}:${m}:${s}`;

    // ステータスクラスの切り替え
    clock.className = '';
    if (statusClass) clock.classList.add(statusClass);
  },

  // 次のバス停表示
  updateNextStop(stop, distance) {
    document.getElementById('next-stop-name').textContent = stop.name;
    document.getElementById('next-stop-time').textContent = `予定 ${stop.departure}`;
    if (distance !== null && distance !== undefined) {
      const distText = distance >= 1000 ?
        `あと 約${(distance / 1000).toFixed(1)}km` :
        `あと 約${Math.round(distance)}m`;
      document.getElementById('next-stop-distance').textContent = distText;
    } else {
      document.getElementById('next-stop-distance').textContent = '';
    }
  },

  // 後続バス停表示
  updateUpcoming(stops) {
    const container = document.getElementById('upcoming-stops');
    if (stops.length === 0) {
      container.innerHTML = '<div class="upcoming-stop"><span class="stop-name" style="color:#666">最終バス停</span></div>';
      return;
    }
    let html = '';
    for (const s of stops) {
      html += `<div class="upcoming-stop">
        <span class="stop-name">${s.name}</span>
        <span class="stop-time">${s.departure}</span>
      </div>`;
    }
    container.innerHTML = html;
  },

  // 通過済みバス停表示
  updatePassed(passedStops) {
    const container = document.getElementById('passed-stops');
    if (passedStops.length === 0) {
      container.innerHTML = '';
      return;
    }
    let html = '';
    for (const p of passedStops) {
      let delayText, delayClass;
      const absSec = Math.abs(p.delaySec);
      if (p.delaySec < -60) {
        delayText = `${Math.round(absSec / 60)}分早発`;
        delayClass = 'early';
      } else if (p.delaySec <= 60) {
        delayText = '定時';
        delayClass = 'on-time';
      } else {
        delayText = `${Math.round(absSec / 60)}分遅れ`;
        delayClass = 'delay';
      }

      html += `<div class="passed-stop">
        <span><span class="check">✓</span>${p.name} ${p.actual}</span>
        <span class="delay-info ${delayClass}">${delayText}</span>
      </div>`;
    }
    container.innerHTML = html;
  },

  // 運行完了表示
  showComplete(trip) {
    const lastStop = trip.stop_times[trip.stop_times.length - 1];
    document.getElementById('complete-message').textContent =
      `${trip.first_time}発 ${trip.first_stop}→${lastStop.name} の運行が完了しました`;
    document.getElementById('trip-complete').classList.remove('hidden');
  },

  hideComplete() {
    document.getElementById('trip-complete').classList.add('hidden');
  }
};
