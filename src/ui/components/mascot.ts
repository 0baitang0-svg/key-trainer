/**
 * 吉祥物「谱谱」表情状态机：圆形玻璃框内展示 Q 版音符精灵少女插画。
 * setMood 通过两张 img 交叠做 180ms 交叉淡入 + 轻微上浮；
 * prefers-reduced-motion 时直接切换不加动效。
 */

export type MascotMood = 'neutral' | 'happy' | 'thinking' | 'oops' | 'cheer' | 'welcome' | 'achievement';

export interface Mascot {
  root: HTMLElement;
  setMood(m: MascotMood): void;
  mood: MascotMood;
  destroy(): void;
}

function srcOf(m: MascotMood): string {
  return `assets/mascot/${m}.png`;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function mascot(opts: { mood?: MascotMood; size?: number; className?: string }): Mascot {
  const { mood: initial = 'neutral', size = 120, className = '' } = opts;

  const root = document.createElement('div');
  root.className = className ? `mascot ${className}` : 'mascot';
  root.style.setProperty('--mascot-size', `${size}px`);

  const imgs = [document.createElement('img'), document.createElement('img')];
  for (const img of imgs) {
    img.className = 'mascot__img';
    img.alt = '谱谱';
    img.draggable = false;
    root.append(img);
  }

  let front = 0;
  let current: MascotMood = initial;
  let timer = 0;

  imgs[front].src = srcOf(current);
  imgs[front].classList.add('is-front');

  function setMood(m: MascotMood): void {
    if (m === current) return;
    current = m;

    const incoming = imgs[1 - front];
    const outgoing = imgs[front];
    incoming.src = srcOf(m);

    if (prefersReducedMotion()) {
      outgoing.classList.remove('is-front', 'is-swap');
      incoming.classList.remove('is-swap');
      incoming.classList.add('is-front');
      front = 1 - front;
      return;
    }

    window.clearTimeout(timer);
    // 强制回流，保证从隐藏态过渡（交叠交叉淡入）
    void incoming.offsetWidth;
    incoming.classList.remove('is-swap');
    incoming.classList.add('is-front', 'is-swap');
    outgoing.classList.remove('is-front', 'is-swap');
    front = 1 - front;
    timer = window.setTimeout(() => {
      incoming.classList.remove('is-swap');
    }, 200);
  }

  return {
    root,
    setMood,
    get mood(): MascotMood {
      return current;
    },
    set mood(m: MascotMood) {
      setMood(m);
    },
    destroy(): void {
      window.clearTimeout(timer);
      root.remove();
    },
  };
}
