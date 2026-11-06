// 全螢幕粒子（彩紙、星星、蠟筆屑）
const MAX = 260; // 同時最多幾顆粒子
export class Particles {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.ps = [];
    this.running = false;
    this.resize();
  }

  resize() {
    // 粒子小又動得快，解析度不用到手機原生的 3 倍，省很多繪圖量
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cv.width = innerWidth * dpr;
    this.cv.height = innerHeight * dpr;
  }

  /** 從 (x, y) 炸開 */
  burst(x, y, { colors = ['#fff'], count = 40, power = 9, spread = Math.PI * 2, angle = -Math.PI / 2, gravity = 0.22, shapes = ['rect', 'star', 'dot'], life = 1 } = {}) {
    count = Math.min(count, MAX - this.ps.length);
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = power * (0.35 + Math.random() * 0.75);
      this.ps.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: gravity * (0.6 + Math.random() * 0.8),
        s: 3 + Math.random() * 6,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        life: 0,
        max: (50 + Math.random() * 50) * life,
      });
    }
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.tick());
    }
  }

  tick() {
    const { g, dpr } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    let alive = 0;
    for (const p of this.ps) {
      if (++p.life >= p.max) continue;
      this.ps[alive++] = p;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const k = p.life / p.max;
      g.globalAlpha = 1 - k * k;
      g.fillStyle = p.c;
      // 直接設定旋轉矩陣，不用 save()/restore()
      const cos = Math.cos(p.rot) * dpr, sin = Math.sin(p.rot) * dpr;
      g.setTransform(cos, sin, -sin, cos, p.x * dpr, p.y * dpr);
      const s = p.s;
      if (p.shape === 'rect') {
        g.fillRect(-s / 2, -s / 4, s, s / 2);
      } else if (p.shape === 'star') {
        g.fillRect(-s / 2, -s / 8, s, s / 4);
        g.fillRect(-s / 8, -s / 2, s / 4, s);
      } else {
        g.fillRect(-s / 4, -s / 4, s / 2, s / 2);
      }
    }
    this.ps.length = alive;
    g.globalAlpha = 1;
    if (alive) requestAnimationFrame(() => this.tick());
    else {
      this.running = false;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.cv.width, this.cv.height);
    }
  }
}

export const TIER_COLORS = {
  base: ['#ffffff', '#fff6d8', '#d9e8ff'],
  gold: ['#ffd84a', '#ffb703', '#fff1a8', '#ffffff', '#f4a300'],
  rainbow: ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa7ff', '#8a5cff', '#ff5cc8', '#ffffff'],
};
