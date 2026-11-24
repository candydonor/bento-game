import '@fontsource-variable/nunito';
import '@fontsource-variable/playfair-display';
import './style.css';
import { createAudio } from './audio.ts';
import { celebrate } from './confetti.ts';
import { icon } from './icons.ts';
import { levels } from './levels.ts';
import { readPreferences, savePreferences } from './preferences.ts';
import { mountScene } from './scene.ts';

const images = {
  maki: new URL('../assets/food/maki.webp', import.meta.url).href,
  onigiri: new URL('../assets/food/onigiri.webp', import.meta.url).href,
  tamago: new URL('../assets/food/tamago.webp', import.meta.url).href,
  dango: new URL('../assets/food/dango.webp', import.meta.url).href,
};

const tutorialHints = [
  'Лотки движутся сами — нажми на нужное блюдо',
  'Лишнее блюдо займёт место на полке',
  'Очисти лоток, чтобы открыть следующий слой',
  'Пропустил блюдо? Подожди, оно вернётся',
];

const rules = 'Собери по три одинаковых блюда для каждого заказа. Колонки лотков движутся сами — нажимай на видимую еду во время движения. Подходящее блюдо отправится в заказ, остальное займёт место на полке. Очисти верхний слой лотка, чтобы открыть следующий. Выполни все заказы и не заполни пять мест на полке.';

const screen = document.querySelector<HTMLElement>('#screen')!;
const overlay = document.querySelector<HTMLElement>('#overlay-root')!;
const preferences = readPreferences(levels.map(level => level.id));
const audio = createAudio(preferences.sound);
let scene: ReturnType<typeof mountScene> | null = null;
let activeLevel = 0;
let hintIndex = 0;
let tutorial = false;
let dialogKind: 'rules' | 'pause' | 'won' | 'lost' | null = null;
let returnFocus: HTMLElement | null = null;
let stopConfetti: (() => void) | null = null;

function soundButton() {
  const name = preferences.sound ? 'Выключить звук' : 'Включить звук';
  return `<button class="icon-button" type="button" data-command="sound" aria-label="${name}" title="${name}">${icon(preferences.sound ? 'speaker' : 'mute')}</button>`;
}

function isUnlocked(index: number) {
  const level = levels[index];
  if (!level) return false;
  if (index === 0 || (index === 1 && preferences.tutorialSkipped)) return true;
  return preferences.completed.includes(level.id) || preferences.completed.includes(levels[index - 1].id);
}

function showMenu() {
  closeDialog(false);
  scene?.destroy();
  scene = null;
  audio.stopMusic();
  tutorial = false;
  document.documentElement.dataset.screen = 'menu';
  const mainUnlocked = isUnlocked(1);
  const next = levels.findIndex((level, index) => isUnlocked(index)
    && !preferences.completed.includes(level.id)
    && (index !== 0 || !preferences.tutorialSkipped));
  const recommended = next >= 0 ? next : levels.length - 1;
  const levelButtons = levels.map((level, index) => {
    const unlocked = isUnlocked(index);
    const completed = preferences.completed.includes(level.id);
    const marker = completed ? icon('check') : unlocked ? icon('arrow') : icon('lock');
    const title = index === 0 ? 'Первые заказы' : index === 1 ? 'Большая смена' : level.name;
    return `<button class="level-row" type="button" data-command="level" data-level="${index}" ${unlocked ? '' : 'disabled'}>
      <span class="level-number">${String(level.id).padStart(2, '0')}</span>
      <span class="level-detail"><strong>${title}</strong><small>${index === 0 ? 'Обучение · ' : ''}${level.orders.length} заказов</small></span>
      <span class="level-marker ${completed ? 'completed' : ''}">${marker}</span>
    </button>`;
  }).join('');

  screen.innerHTML = `
    <section class="menu" aria-labelledby="game-title">
      <div class="menu-tools">
        <button class="icon-button" type="button" data-command="rules" aria-label="Как играть" title="Как играть">${icon('help')}</button>
        ${soundButton()}
      </div>
      <header class="menu-heading">
        <div class="brand-icon" aria-hidden="true">${icon('tray')}</div>
        <h1 id="game-title">Bento <em>Orders</em></h1>
        <p>Головоломка на кухне</p>
      </header>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-napkin"></div>
        <div class="hero-chopsticks"></div>
        <div class="hero-plate">
          <div class="plate-ring"></div>
          <img class="hero-food hero-maki" src="${images.maki}" alt="" />
          <img class="hero-food hero-onigiri" src="${images.onigiri}" alt="" />
          <img class="hero-food hero-tamago" src="${images.tamago}" alt="" />
        </div>
        <div class="hero-saucer"><img src="${images.dango}" alt="" /></div>
        ${icon('sparkle', 'hero-sparkle sparkle-left')}
        ${icon('sparkle', 'hero-sparkle sparkle-right')}
      </div>
      <div class="menu-panel">
        <button class="button primary menu-start" type="button" data-command="level" data-level="${recommended}">
          ${icon('play')} <span>${mainUnlocked ? `Играть · уровень ${levels[recommended].id}` : 'Начать игру'}</span> ${icon('arrow')}
        </button>
        <section class="menu-levels" aria-labelledby="levels-title">
          <div class="level-heading">
            <h2 id="levels-title">Уровни</h2>
            ${mainUnlocked ? '' : '<button class="skip-training" type="button" data-command="skip-training">Пропустить обучение</button>'}
          </div>
          <div class="level-list">${levelButtons}</div>
        </section>
      </div>
    </section>`;
}

function tutorialDone() {
  tutorial = false;
  preferences.tutorialSeen = true;
  savePreferences(preferences);
  screen.querySelector('.tutorial-controls')?.remove();
  scene?.setHint('');
}

function renderHint() {
  scene?.setHint(tutorial ? tutorialHints[hintIndex] : '');
}

function startLevel(index: number) {
  if (!levels[index] || !isUnlocked(index)) return;
  closeDialog(false);
  scene?.destroy();
  audio.silence();
  audio.stopMusic();
  audio.resumeMusic();
  document.documentElement.dataset.screen = 'game';
  activeLevel = index;
  hintIndex = 0;
  tutorial = index === 0 && !preferences.tutorialSeen;
  screen.innerHTML = '<div class="game-host"></div>';
  const host = screen.querySelector<HTMLElement>('.game-host')!;
  scene = mountScene(host, {
    level: levels[index],
    onPause: pause,
    onResult: finishLevel,
    onAction: () => {
      if (!tutorial) return;
      hintIndex += 1;
      if (hintIndex >= tutorialHints.length) tutorialDone();
      else renderHint();
    },
    onSound: audio.play,
  });
  if (tutorial) {
    host.querySelector('[data-hint-controls]')?.insertAdjacentHTML('beforeend', '<div class="tutorial-controls"><button class="tutorial-skip" type="button" data-command="skip">Пропустить подсказки</button></div>');
    renderHint();
  }
}

function closeDialog(restoreFocus = true) {
  const wasOpen = dialogKind !== null;
  dialogKind = null;
  stopConfetti?.();
  stopConfetti = null;
  overlay.replaceChildren();
  screen.inert = false;
  if (wasOpen && restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function openDialog(kind: Exclude<typeof dialogKind, null>, content: string, label: string) {
  if (!dialogKind) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialogKind = kind;
  screen.inert = true;
  overlay.innerHTML = `<div class="scrim scrim-${kind}"><section class="dialog" role="dialog" aria-modal="true" aria-label="${label}">${content}</section></div>`;
  overlay.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
}

function showRules() {
  openDialog('rules', `
    <button class="icon-button dialog-close" type="button" data-command="close" aria-label="Закрыть">${icon('close')}</button>
    <div class="dialog-icon">${icon('help')}</div>
    <h2>Как играть</h2>
    <p class="rules-text">${rules}</p>
    <button class="button primary" type="button" data-command="close">Понятно</button>
  `, 'Как играть');
}

function pause() {
  if (!scene || dialogKind) return;
  scene.setPaused(true);
  audio.silence();
  audio.pauseMusic();
  openDialog('pause', `
    <div class="dialog-icon">${icon('tray')}</div>
    <h2>Пауза</h2>
    <div class="dialog-actions">
      <button class="button primary" type="button" data-command="resume">Продолжить</button>
      <button class="button secondary" type="button" data-command="restart">Начать заново</button>
      <button class="button secondary sound-setting" type="button" data-command="sound">
        ${icon(preferences.sound ? 'speaker' : 'mute')} Звук ${preferences.sound ? 'включён' : 'выключен'}
      </button>
      <button class="button quiet" type="button" data-command="menu">В меню</button>
    </div>
  `, 'Пауза');
}

function finishLevel(status: 'won' | 'lost') {
  audio.stopMusic();
  if (tutorial) tutorialDone();
  const won = status === 'won';
  const level = levels[activeLevel];
  if (won && !preferences.completed.includes(level.id)) {
    preferences.completed.push(level.id);
    savePreferences(preferences);
  }
  audio.play(won ? 'win' : 'lose');
  const next = won && levels[activeLevel + 1];
  const confetti = won && !matchMedia('(prefers-reduced-motion: reduce)').matches
    ? '<canvas class="confetti" aria-hidden="true"></canvas>'
    : '';
  openDialog(status, `
    ${confetti}
    <div class="dialog-icon ${won ? 'success' : ''}">${icon(won ? 'check' : 'tray')}</div>
    <h2>${won ? 'Все заказы готовы!' : 'Нет свободного места'}</h2>
    <p>${won ? `Упаковано заказов: ${level.orders.length} из ${level.orders.length}` : 'На полке заняты все пять блюдец.'}</p>
    <div class="dialog-actions">
      ${next ? '<button class="button primary" type="button" data-command="next">Следующий уровень</button>' : ''}
      ${won ? '' : '<button class="button primary" type="button" data-command="restart">Попробовать снова</button>'}
      <button class="button ${won && !next ? 'primary' : 'quiet'}" type="button" data-command="menu">В меню</button>
    </div>
  `, won ? 'Все заказы готовы' : 'Нет свободного места');
  const canvas = overlay.querySelector<HTMLCanvasElement>('.confetti');
  if (canvas) stopConfetti = celebrate(canvas);
}

function toggleSound(button: HTMLButtonElement) {
  preferences.sound = !preferences.sound;
  savePreferences(preferences);
  audio.setEnabled(preferences.sound);
  if (dialogKind === 'pause') {
    button.innerHTML = `${icon(preferences.sound ? 'speaker' : 'mute')} Звук ${preferences.sound ? 'включён' : 'выключен'}`;
  } else {
    button.innerHTML = icon(preferences.sound ? 'speaker' : 'mute');
    const name = preferences.sound ? 'Выключить звук' : 'Включить звук';
    button.setAttribute('aria-label', name);
    button.title = name;
  }
}

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('button[data-command]');
  if (!button || button.disabled) return;

  switch (button.dataset.command) {
    case 'level': startLevel(Number(button.dataset.level)); break;
    case 'rules': showRules(); break;
    case 'sound': toggleSound(button); break;
    case 'menu': showMenu(); break;
    case 'restart': startLevel(activeLevel); break;
    case 'next': startLevel(activeLevel + 1); break;
    case 'skip': tutorialDone(); break;
    case 'skip-training':
      preferences.tutorialSkipped = true;
      preferences.tutorialSeen = true;
      savePreferences(preferences);
      startLevel(1);
      break;
    case 'close': closeDialog(); break;
    case 'resume':
      closeDialog();
      audio.resumeMusic();
      scene?.setPaused(false);
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

document.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    if (dialogKind === 'pause') overlay.querySelector<HTMLButtonElement>('[data-command="resume"]')?.click();
    else if (dialogKind === 'rules') closeDialog();
    else pause();
    return;
  }
  if (event.key === 'Tab' && dialogKind) {
    const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault();
      buttons.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
      event.preventDefault();
      buttons[0]?.focus();
    }
  }
});

showMenu();
