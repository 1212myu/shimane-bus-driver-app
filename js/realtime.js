// Supabase リアルタイム位置共有モジュール
const BusRealtime = {
  supabase: null,
  activeTripId: null,
  lastSendTime: 0,
  THROTTLE_MS: 5000,
  enabled: false,

  init() {
    if (typeof window.__supabase === 'undefined') {
      console.warn('Supabase SDK not loaded – realtime disabled');
      return;
    }
    const cfg = BusRealtime.config;
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      console.warn('Supabase not configured – realtime disabled');
      return;
    }
    this.supabase = window.__supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    this.enabled = true;
  },

  async startTrip(trip) {
    if (!this.enabled) return;
    this.activeTripId = trip.trip_id;
    try {
      await this.supabase.from('bus_locations').upsert({
        trip_id: trip.trip_id,
        direction: trip.direction,
        headsign: trip.headsign,
        lat: null,
        lon: null,
        accuracy: null,
        next_stop_id: trip.stop_times[0]?.stop_id || null,
        next_stop_name: trip.stop_times[0]?.name || null,
        passed_stop_index: -1,
        delay_status: null,
        delay_seconds: null,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Realtime startTrip failed:', e);
    }
  },

  async sendUpdate(lat, lon, accuracy, matchingState) {
    if (!this.enabled || !this.activeTripId) return;

    const now = Date.now();
    if (now - this.lastSendTime < this.THROTTLE_MS) return;
    this.lastSendTime = now;

    const data = {
      trip_id: this.activeTripId,
      lat,
      lon,
      accuracy: Math.round(accuracy),
      updated_at: new Date().toISOString()
    };

    if (matchingState && matchingState.status === 'driving') {
      data.next_stop_id = matchingState.nextStop?.stop_id || null;
      data.next_stop_name = matchingState.nextStop?.name || null;
      data.passed_stop_index = Matching.passedStopIndex;
      if (matchingState.delay) {
        data.delay_status = matchingState.delay.status;
        data.delay_seconds = Math.round(matchingState.delay.delaySec);
      }
    }

    try {
      await this.supabase.from('bus_locations').update(data).eq('trip_id', this.activeTripId);
    } catch (e) {
      console.warn('Realtime sendUpdate failed:', e);
    }
  },

  async endTrip() {
    if (!this.enabled || !this.activeTripId) return;
    try {
      await this.supabase.from('bus_locations').delete().eq('trip_id', this.activeTripId);
    } catch (e) {
      console.warn('Realtime endTrip failed:', e);
    }
    this.activeTripId = null;
  }
};

BusRealtime.config = {
  SUPABASE_URL: 'https://rpzkrgurqjdhjjpvfvjx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwemtyZ3VycWpkaGpqcHZmdmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMTc1NTksImV4cCI6MjA5MTU5MzU1OX0.j-oFVtFoj5sw-eUHH31AQCgwnXwnRO3JHokP81u14Lk'
};
