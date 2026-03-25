// 早発防止アラート
const Alert = {
  active: false,
  checkInterval: null,

  show(stopName, scheduledTime) {
    if (this.active) return;
    this.active = true;

    const el = document.getElementById('early-alert');
    const msg = document.getElementById('alert-message');
    msg.textContent = `発車予定 ${scheduledTime} まで待機`;
    el.classList.remove('hidden');

    // 予定時刻を過ぎたら自動解除
    this.checkInterval = setInterval(() => {
      const now = new Date();
      const [h, m] = scheduledTime.split(':').map(Number);
      const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      if (now >= scheduled) {
        this.hide();
      }
    }, 1000);
  },

  hide() {
    this.active = false;
    document.getElementById('early-alert').classList.add('hidden');
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
};
