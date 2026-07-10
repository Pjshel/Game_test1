import type { FeelParams } from '../../core/feel';

/**
 * 灰盒调参面板(WP1.5 灵魂之二)。原生 DOM、零 UI 框架;
 * 覆盖宪法§4/§5/§6全部带数字参数,滑杆实时生效;可折叠;
 * "导出参数JSON" = 复制剪贴板 + 触发下载,供产品负责人回传架构轨。
 * 风格遵循宪法附则A:现代扁平深色,无任何国风元素。
 */

interface SliderDef {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: readonly SliderDef[] = [
  { path: 'player.moveSpeed', label: '玩家移速(格/秒)', min: 2, max: 10, step: 0.05 },
  { path: 'weapon.bulletSpeedMul', label: '弹速系数(×移速)', min: 1, max: 4, step: 0.05 },
  { path: 'weapon.fireRate', label: '武器射速(发/秒)', min: 0.5, max: 10, step: 0.1 },
  { path: 'weapon.damage', label: '武器伤害', min: 1, max: 5, step: 1 },
  { path: 'weapon.energyCost', label: '蓝耗(点/发)', min: 0, max: 6, step: 1 },
  { path: 'energy.max', label: '能量池上限', min: 50, max: 400, step: 10 },
  { path: 'energy.orbEnergy', label: '能量球回能', min: 1, max: 50, step: 1 },
  { path: 'energy.orbPickupRadius', label: '拾取半径(格)', min: 0.3, max: 4, step: 0.05 },
  { path: 'player.maxHp', label: '血量上限', min: 1, max: 10, step: 1 },
  { path: 'player.maxShield', label: '盾量上限', min: 0, max: 10, step: 1 },
  { path: 'player.shieldRegenDelayS', label: '回盾延迟(秒)', min: 0, max: 8, step: 0.1 },
  { path: 'player.shieldRegenPerS', label: '回盾速率(点/秒)', min: 0, max: 5, step: 0.1 },
  { path: 'player.iframesS', label: '无敌帧(秒)', min: 0, max: 2, step: 0.05 },
  { path: 'enemies.bulletSpeedMul', label: '敌弹速度系数', min: 0.5, max: 3, step: 0.05 },
  { path: 'enemies.bulletDamage', label: '敌弹伤害', min: 0, max: 5, step: 1 },
  { path: 'enemies.fighterFirePeriodS', label: '还击靶射击间隔(秒)', min: 0.3, max: 5, step: 0.1 },
  { path: 'enemies.wandererSpeedMul', label: '游走靶速度系数', min: 0.2, max: 2, step: 0.05 },
  { path: 'enemies.countStatic', label: '静止靶数量', min: 0, max: 10, step: 1 },
  { path: 'enemies.countWanderer', label: '游走靶数量', min: 0, max: 10, step: 1 },
  { path: 'enemies.countFighter', label: '还击靶数量', min: 0, max: 10, step: 1 },
  { path: 'enemies.knockbackTiles', label: '击退力度(格)', min: 0, max: 1.5, step: 0.05 },
  { path: 'juice.hitStopHitMs', label: '顿帧·命中(毫秒)', min: 0, max: 120, step: 5 },
  { path: 'juice.hitStopKillMs', label: '顿帧·击杀(毫秒)', min: 0, max: 200, step: 5 },
  { path: 'juice.shakeHit', label: '震屏·微(命中)', min: 0, max: 0.01, step: 0.0005 },
  { path: 'juice.shakeKill', label: '震屏·中(击杀)', min: 0, max: 0.02, step: 0.0005 },
  { path: 'juice.shakeBig', label: '震屏·大(预留爆炸)', min: 0, max: 0.05, step: 0.001 },
  { path: 'flow.respawnDelayS', label: '靶子重生延迟(秒)', min: 0, max: 5, step: 0.1 },
  { path: 'flow.deathFreezeS', label: '死亡定格(秒)', min: 0, max: 2, step: 0.05 },
];

function getByPath(obj: unknown, path: string): number {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur as number;
}

function setByPath(obj: unknown, path: string, value: number): void {
  const keys = path.split('.');
  let cur: unknown = obj;
  for (const key of keys.slice(0, -1)) {
    cur = (cur as Record<string, unknown>)[key];
  }
  (cur as Record<string, number>)[keys[keys.length - 1]!] = value;
}

export class DebugPanel {
  private collapsed = false;

  constructor(
    private readonly getParams: () => FeelParams,
    private readonly apply: (params: FeelParams) => void,
  ) {}

  mount(): void {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:fixed',
      'top:10px',
      'right:10px',
      'width:290px',
      'max-height:calc(100vh - 20px)',
      'display:flex',
      'flex-direction:column',
      'background:#171b21e6',
      'border:1px solid #2a323d',
      'border-radius:10px',
      'font:12px/1.5 ui-sans-serif,system-ui,sans-serif',
      'color:#c8d0da',
      'z-index:1000',
      'backdrop-filter:blur(4px)',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none';
    const title = document.createElement('span');
    title.textContent = '⚙ 手感调参(v0)';
    title.style.cssText = 'font-weight:600;color:#4fd1c5;flex:1';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '导出参数JSON';
    exportBtn.style.cssText = [
      'background:#4fd1c5',
      'color:#0b0e11',
      'border:none',
      'border-radius:6px',
      'padding:4px 10px',
      'font-weight:600',
      'cursor:pointer',
    ].join(';');
    const chevron = document.createElement('span');
    chevron.textContent = '▾';
    header.append(title, exportBtn, chevron);

    const body = document.createElement('div');
    body.style.cssText = 'overflow-y:auto;padding:2px 12px 12px';

    header.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      body.style.display = this.collapsed ? 'none' : 'block';
      chevron.textContent = this.collapsed ? '▸' : '▾';
    });
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportJson(exportBtn);
    });

    for (const def of SLIDERS) {
      body.append(this.buildRow(def));
    }

    root.append(header, body);
    document.body.append(root);

    // 小屏(手机)默认折叠,避免遮挡打靶区
    if (window.innerWidth < 900) {
      header.click();
    }
  }

  private buildRow(def: SliderDef): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'margin-top:8px';
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;justify-content:space-between';
    const label = document.createElement('span');
    label.textContent = def.label;
    const value = document.createElement('span');
    value.style.cssText = 'color:#4fd1c5;font-variant-numeric:tabular-nums';
    line.append(label, value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(def.min);
    slider.max = String(def.max);
    slider.step = String(def.step);
    slider.style.cssText = 'width:100%;accent-color:#4fd1c5;margin:2px 0 0';

    const current = getByPath(this.getParams(), def.path);
    slider.value = String(current);
    value.textContent = this.format(current);

    slider.addEventListener('input', () => {
      const next = structuredClone(this.getParams());
      const parsed = Number(slider.value);
      setByPath(next, def.path, parsed);
      value.textContent = this.format(parsed);
      this.apply(next); // 实时生效;core 侧 zod 校验兜底
    });

    row.append(line, slider);
    return row;
  }

  private format(v: number): string {
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  }

  private exportJson(button: HTMLButtonElement): void {
    const json = JSON.stringify(this.getParams(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'feel-params-v0.json';
    link.click();
    URL.revokeObjectURL(url);
    const done = (): void => {
      const old = button.textContent;
      button.textContent = '已复制+下载 ✓';
      setTimeout(() => {
        button.textContent = old;
      }, 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(done, done);
    } else {
      done();
    }
  }
}
