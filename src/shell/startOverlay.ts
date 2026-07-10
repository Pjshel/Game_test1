/**
 * 开始遮罩:必须点击一次才开局。一次点击同时解决三件事——
 * 页面获得键盘焦点、浏览器音频解锁、玩家看清主角与操作方式后世界才开始转。
 * 风格遵循宪法附则A:现代扁平深色。
 */
export function showStartOverlay(onStart: () => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:14px',
    'background:#0b0e11cc',
    'backdrop-filter:blur(2px)',
    'z-index:2000',
    'cursor:pointer',
    'user-select:none',
    'font-family:ui-sans-serif,system-ui,sans-serif',
    'color:#c8d0da',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '灰盒手感房 v0';
  title.style.cssText = 'font-size:26px;font-weight:700;color:#4fd1c5;letter-spacing:2px';

  const lineDesktop = document.createElement('div');
  lineDesktop.textContent = '移动:WASD 或 方向键 · 开火:按住鼠标左键(自动索敌,无需瞄准)';
  const lineTouch = document.createElement('div');
  lineTouch.textContent = '触屏:按住屏幕拖动 = 摇杆 · 右下角按钮 = 开火';
  lineTouch.style.cssText = lineDesktop.style.cssText = 'font-size:14px;color:#8a94a3';

  const you = document.createElement('div');
  you.textContent = '青色方块就是你';
  you.style.cssText =
    'font-size:14px;color:#4fd1c5;border:1px solid #4fd1c5;border-radius:6px;padding:4px 12px';

  const prompt = document.createElement('div');
  prompt.textContent = '点击任意位置开始';
  prompt.style.cssText = 'font-size:16px;color:#eaf6f4;margin-top:10px';
  prompt.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], {
    duration: 1600,
    iterations: Infinity,
  });

  overlay.append(title, you, lineDesktop, lineTouch, prompt);
  overlay.addEventListener(
    'pointerdown',
    () => {
      overlay.remove();
      onStart();
    },
    { once: true },
  );
  document.body.append(overlay);
}
