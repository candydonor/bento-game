import './scene.css';
import {
  activeLayer, advanceTime, createGame, finishAction, ITEMS_PER_ORDER, LOGICAL_WIDTH, ORDER_SLOTS,
  previewLayer, STORAGE_SLOTS,
  selectFood, setFieldHeight, setPaused,
  type Action, type ActionEvent, type FoodItem, type Game, type Level,
  type Presentation, type TransferEvent,
} from './game.ts';
import { foodNames, type FoodType } from './levels.ts';
import {
  hitTest, matchesTap, projectTrays, slotCenter, visibleTrays,
  PREVIEW_HEIGHT, PREVIEW_WIDTH, PREVIEW_Y, TRAY_HEIGHT, TRAY_WIDTH,
  type Point, type ProjectedSlot, type TapGesture,
} from './geometry.ts';

type SceneOptions = {
  level: Level;
  onPause: () => void;
  onResult: (status: 'won' | 'lost', state: Game) => void;
  onAction?: (action: Action) => void;
  onSound?: (sound: 'select' | 'delivery' | 'complete') => void;
};

type Sequence = {
  events: ActionEvent[];
  index: number;
  started: number;
  source: Point;
  flightSource: Point;
};

const TRAY_FOOD_WIDTH = 26;
const TRAY_FOOD_HEIGHT = 48;
const PREVIEW_FOOD_WIDTH = 19;
const PREVIEW_FOOD_HEIGHT = 24;
const PREVIEW_LEFT = (TRAY_WIDTH - PREVIEW_WIDTH) / 2;
const SAUCER_FOOD_SCALE = .85;

const images = new Map<FoodType, HTMLImageElement>();
const urls = new Map<FoodType, string>();
for (const type of Object.keys(foodNames) as FoodType[]) {
  const url = new URL(`../assets/food/${type}.webp`, import.meta.url).href;
  urls.set(type, url);
}

function art(type: FoodType): HTMLImageElement {
  const cached = images.get(type);
  if (cached) return cached;
  const image = new Image();
  image.decoding = 'async';
  image.src = urls.get(type) ?? '';
  images.set(type, image);
  return image;
}

function domPart<T extends Element>(container: Element, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing scene element ${selector}`);
  return element;
}

function fillRounded(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function gradient(
  context: CanvasRenderingContext2D,
  top: number,
  bottom: number,
  first: string,
  second: string,
) {
  const fill = context.createLinearGradient(0, top, 0, bottom);
  fill.addColorStop(0, first);
  fill.addColorStop(1, second);
  return fill;
}

function makeTrayArt(kind: 'active' | 'empty' | 'preview'): HTMLCanvasElement {
  const buffer = document.createElement('canvas');
  const boxHeight = kind === 'preview' ? PREVIEW_HEIGHT : TRAY_HEIGHT;
  buffer.width = (TRAY_WIDTH + 6) * 2;
  buffer.height = (boxHeight + 7) * 2;
  const context = buffer.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.scale(2, 2);
  context.translate(3, 2);
  context.shadowColor = '#60452848';
  context.shadowBlur = 4;
  context.shadowOffsetY = 2;
  if (kind === 'preview') {
    fillRounded(context, PREVIEW_LEFT, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT, 7, '#bda087');
    context.shadowColor = 'transparent';
    fillRounded(context, PREVIEW_LEFT, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT - 2, 7, '#fffaf1');
    fillRounded(context, PREVIEW_LEFT + 3, 2.5, PREVIEW_WIDTH - 6, PREVIEW_HEIGHT - 7, 4,
      gradient(context, 2.5, PREVIEW_HEIGHT - 5, '#e9dcc7', '#f8efe0'));
    return buffer;
  }

  const isEmpty = kind === 'empty';
  context.globalAlpha = isEmpty ? .59 : 1;
  fillRounded(context, 0, 0, TRAY_WIDTH, TRAY_HEIGHT, 10, '#9b603a');
  context.shadowColor = 'transparent';
  fillRounded(context, .7, .7, TRAY_WIDTH - 1.4, TRAY_HEIGHT - 4, 9, '#f2c79a');
  fillRounded(context, 1.3, 2, TRAY_WIDTH - 2.6, TRAY_HEIGHT - 5.7, 8,
    gradient(context, 1, TRAY_HEIGHT - 3, '#eaba89', '#c89162'));
  fillRounded(context, 4.5, 4, TRAY_WIDTH - 9, TRAY_HEIGHT - 10, 6, '#996139');

  const compartmentFill = gradient(context, 6, TRAY_HEIGHT - 8, '#c99668', '#e9bd8d');
  for (let i = 0; i < 3; i++) {
    const left = slotCenter(i) - 12;
    fillRounded(context, left, 5.7, 24, TRAY_HEIGHT - 13.5, 3.4, '#ba8257');
    fillRounded(context, left + .35, 7.1, 23.3, TRAY_HEIGHT - 15.2, 3, compartmentFill);

    context.lineWidth = .5;
    for (let grain = 0; grain < 5; grain++) {
      const y = 12 + grain * 8 + ((i + grain) % 3);
      context.beginPath();
      context.moveTo(left + 2, y);
      context.bezierCurveTo(left + 9, y - 1.3, left + 15, y + 1.2, left + 22, y + .2);
      context.strokeStyle = grain % 2 === 0 ? '#9f69442e' : '#fff4d74c';
      context.stroke();
    }
  }
  context.strokeStyle = '#ffe2ad72';
  context.lineWidth = .65;
  context.beginPath();
  context.moveTo(7, TRAY_HEIGHT - 5.3);
  context.quadraticCurveTo(TRAY_WIDTH / 2, TRAY_HEIGHT - 4.4, TRAY_WIDTH - 7, TRAY_HEIGHT - 5.3);
  context.stroke();
  return buffer;
}

function drawFood(
  context: CanvasRenderingContext2D,
  item: FoodItem,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  angle = 0,
) {
  const image = art(item.type);
  if (!image.complete || !image.naturalWidth) return;
  const fit = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  if (!angle) {
    context.drawImage(image, x - width / 2, y - height / 2, width, height);
    return;
  }
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function renderMarkup(scene: HTMLElement, level: Level) {
  scene.innerHTML = `
    <header class="game-hud">
      <div class="game-hud-top">
        <div class="game-level"><span>Уровень</span><span class="game-level-number">${level.id}</span></div>
        <div class="game-progress">
          <span class="game-progress-label">Заказы: 0/${level.orders.length}</span>
          <span class="game-progress-track" aria-hidden="true"><span class="game-progress-fill"></span></span>
        </div>
        <button class="game-pause" type="button" aria-label="Пауза" title="Пауза">
          <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3.4" height="12" rx="1.25"/><rect x="10.6" y="3" width="3.4" height="12" rx="1.25"/></svg>
        </button>
      </div>
      <div class="game-orders" aria-label="Активные заказы">
        ${Array.from({ length: ORDER_SLOTS }, (_, slot) => `<div class="game-order" data-order-slot="${slot}" role="img"><div class="game-order-food">${Array.from({ length: ITEMS_PER_ORDER }, () => '<div class="game-order-item"><img alt="" draggable="false"></div>').join('')}</div><div class="game-order-count" aria-hidden="true"></div></div>`).join('')}
      </div>
    </header>
    <section class="game-shelf" aria-label="Временное хранение">
      <div class="game-storage">
        ${Array.from({ length: STORAGE_SLOTS }, (_, slot) => `<div class="game-storage-slot" data-storage-slot="${slot}" role="img"><img hidden alt="" draggable="false"></div>`).join('')}
      </div>
      <p class="game-warning" role="status" hidden>Осталось 1 место</p>
    </section>
    <div class="game-hint" hidden><span class="game-hint-text" role="status"></span><span data-hint-controls></span></div>
    <div class="game-field">
      <canvas class="game-board" data-playfield tabindex="0" aria-label="Движущиеся лотки. Выбрать блюдо стрелками, отправить клавишей Enter."></canvas>
    </div>
    <canvas class="game-effects" aria-hidden="true"></canvas>
  `;
}

function midpoint(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

function pointForSlot(slot: ProjectedSlot): Point {
  return {
    x: slot.x + slot.width / 2,
    y: slot.y + slot.height / 2 - 1,
  };
}

export function mountScene(container: HTMLElement, options: SceneOptions) {
  const { level } = options;
  const state = createGame(level);
  const scene = document.createElement('section');
  scene.className = 'game-scene';
  scene.setAttribute('aria-label', 'Игровое поле Bento Orders');
  renderMarkup(scene, level);
  container.append(scene);

  const field = domPart<HTMLElement>(scene, '.game-field');
  const board = domPart<HTMLCanvasElement>(scene, '.game-board');
  const effects = domPart<HTMLCanvasElement>(scene, '.game-effects');
  const boardContext = board.getContext('2d');
  const effectsContext = effects.getContext('2d');
  if (!boardContext || !effectsContext) throw new Error('Canvas 2D is unavailable');
  const pauseButton = domPart<HTMLButtonElement>(scene, '.game-pause');
  const progressLabel = domPart<HTMLElement>(scene, '.game-progress-label');
  const progressFill = domPart<HTMLElement>(scene, '.game-progress-fill');
  const warning = domPart<HTMLElement>(scene, '.game-warning');
  const hint = domPart<HTMLElement>(scene, '.game-hint');
  const hintText = domPart<HTMLElement>(scene, '.game-hint-text');
  const orderCards = Array.from(scene.querySelectorAll<HTMLElement>('[data-order-slot]'));
  const storageSlots = Array.from(scene.querySelectorAll<HTMLElement>('[data-storage-slot]'));
  const orderItems = orderCards.map(card => Array.from(card.querySelectorAll<HTMLElement>('.game-order-item')));
  const orderCounts = orderCards.map(card => domPart<HTMLElement>(card, '.game-order-count'));
  const storageImages = storageSlots.map(slot => domPart<HTMLImageElement>(slot, 'img'));
  const trayArt = makeTrayArt('active');
  const emptyArt = makeTrayArt('empty');
  const previewArt = makeTrayArt('preview');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const listener = { signal: listeners.signal };
  let fieldHeight = 1;
  let scale = 1;
  let dpr = 1;
  let width = 1;
  let height = 1;
  let frame = 0;
  let lastFrame: number | null = null;
  let runningTime = 0;
  let hudTime = -100;
  let paused = false;
  let destroyed = false;
  let gesture: (TapGesture & { pointerId: number; started: number }) | null = null;
  let keyboardId: string | null = null;
  let sequence: Sequence | null = null;
  let newLayer: { trayId: string; started: number } | null = null;
  let hiddenLayer: { trayId: string; previousPreview: ReturnType<typeof previewLayer> } | null = null;
  let impact: { target: TransferEvent['to']; started: number } | null = null;

  Object.keys(foodNames).forEach(type => art(type as FoodType));

  function setPresentation(snapshot: Presentation) {
    progressLabel.textContent = `Заказы: ${snapshot.completedOrders}/${level.orders.length}`;
    progressFill.style.transform = `scaleX(${snapshot.completedOrders / level.orders.length})`;

    orderCards.forEach((card, slot) => {
      const order = snapshot.orders[slot];
      card.classList.toggle('empty', !order);
      if (!order) {
        card.removeAttribute('aria-label');
        card.removeAttribute('data-order');
        return;
      }
      card.classList.toggle('full', order.collected === order.required);
      card.dataset.order = order.foodType;
      card.setAttribute('aria-label', `${foodNames[order.foodType]} · ${order.collected} из ${order.required}`);
      orderCounts[slot].textContent = `${order.collected}/${order.required}`;
      orderItems[slot].forEach((cell, position) => {
        cell.classList.toggle('filled', order.collected > position);
        const image = domPart<HTMLImageElement>(cell, 'img');
        const url = art(order.foodType).src;
        if (image.src !== url) image.src = url;
      });
    });

    const dangerous = snapshot.storage.length === STORAGE_SLOTS - 1;
    const full = snapshot.storage.length === storageSlots.length;
    warning.hidden = !dangerous;
    scene.toggleAttribute('data-danger', dangerous || full);
    storageSlots.forEach((slot, index) => {
      const item = snapshot.storage[index];
      slot.classList.remove('outgoing');
      slot.classList.toggle('warning', dangerous && index === storageSlots.length - 1);
      slot.classList.toggle('overflowed', full);
      slot.setAttribute('aria-label', item ? foodNames[item.type] : 'Свободное блюдце');
      storageImages[index].hidden = !item;
      if (item) {
        const url = art(item.type).src;
        if (storageImages[index].src !== url) storageImages[index].src = url;
      }
    });
  }

  function drawBoard() {
    if (!boardContext || destroyed) return;
    boardContext.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    boardContext.clearRect(0, 0, LOGICAL_WIDTH, fieldHeight);
    for (const { tray, x, y } of visibleTrays(state, fieldHeight)) {
      const active = activeLayer(tray);
      const suppress = hiddenLayer?.trayId === tray.id;
      const preview = suppress ? hiddenLayer?.previousPreview : previewLayer(tray);
      const wood = active || suppress ? trayArt : emptyArt;
      boardContext.drawImage(wood, x - 3, y - 2, TRAY_WIDTH + 6, TRAY_HEIGHT + 7);

      if (preview) {
        boardContext.drawImage(previewArt, x - 3, y + PREVIEW_Y - 2, TRAY_WIDTH + 6, PREVIEW_HEIGHT + 7);
        preview.forEach((item, slot) => {
          if (!item) return;
          const centerX = x + PREVIEW_LEFT + 4 + (PREVIEW_WIDTH - 8) * (slot + .5) / ITEMS_PER_ORDER;
          drawFood(boardContext, item, centerX, y + PREVIEW_Y + PREVIEW_HEIGHT / 2 - 1, PREVIEW_FOOD_WIDTH, PREVIEW_FOOD_HEIGHT);
        });
      }
      if (!active || suppress) continue;

      const opening = newLayer?.trayId === tray.id;
      const grow = opening ? easeOut(Math.min(1, (runningTime - (newLayer?.started ?? 0)) / 205)) : 1;
      for (const [slot, item] of active.entries()) {
        if (!item) continue;
        const centerX = x + slotCenter(slot);
        const centerY = y + TRAY_HEIGHT / 2 - 1;
        const keyboardSelected = keyboardId === item.id && document.activeElement === board;
        if (keyboardSelected) {
          boardContext.lineWidth = 2;
          boardContext.strokeStyle = '#8c3756';
          boardContext.beginPath();
          boardContext.roundRect(centerX - 11.5, y + 7, 23, TRAY_HEIGHT - 15, 4);
          boardContext.stroke();
        }
        const press = gesture?.itemId === item.id ? easeOut(Math.min(1, (runningTime - gesture.started) / 90)) : 0;
        boardContext.globalAlpha = motionPreference.matches ? 1 : .25 + grow * .75;
        const size = (1 - .13 * press) * (.9 + grow * .1);
        drawFood(boardContext, item, centerX, centerY, TRAY_FOOD_WIDTH * size, TRAY_FOOD_HEIGHT * size);
        boardContext.globalAlpha = 1;
      }
    }
  }

  function destination(target: TransferEvent['to']): DOMRect {
    if (target.kind === 'order') return orderItems[target.slot][target.position].getBoundingClientRect();
    return storageSlots[target.slot].getBoundingClientRect();
  }

  function drawEffects() {
    if (!effectsContext || destroyed) return;
    effectsContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    effectsContext.clearRect(0, 0, width, height);
    if (!sequence && !impact) return;
    const context = effectsContext;
    const bounds = scene.getBoundingClientRect();
    const event = sequence?.events[sequence.index];
    if (event?.kind === 'transfer' && sequence) {
      const targetRect = destination(event.to);
      const target = midpoint(targetRect);
      const start = { x: sequence.flightSource.x * width, y: sequence.flightSource.y * height };
      const time = Math.min(1, (runningTime - sequence.started) / duration(event));
      const reduced = motionPreference.matches;
      const position = easeOut(time);
      const x = start.x + (target.x - bounds.left - start.x) * position;
      const lift = reduced ? 0 : Math.min(59, Math.abs(target.y - bounds.top - start.y) * .24);
      const y = start.y + (target.y - bounds.top - start.y) * position - lift * Math.sin(Math.PI * position);
      const saucerSource = event.from.kind === 'storage'
        ? storageImages[event.from.slot].getBoundingClientRect()
        : null;
      const fromWidth = saucerSource?.width ?? TRAY_FOOD_WIDTH * scale;
      const fromHeight = saucerSource?.height ?? TRAY_FOOD_HEIGHT * scale;
      const targetScale = event.to.kind === 'storage' ? SAUCER_FOOD_SCALE : 1;
      const flightWidth = fromWidth + (targetRect.width * targetScale - fromWidth) * position;
      const flightHeight = fromHeight + (targetRect.height * targetScale - fromHeight) * position;
      drawFood(context, event.item, x, y, flightWidth, flightHeight, (reduced ? 0 : .23) * Math.sin(Math.PI * position));
    }

    if (impact) {
      const elapsed = runningTime - impact.started;
      if (elapsed >= 165 || motionPreference.matches) {
        impact = null;
        return;
      }
      const target = midpoint(destination(impact.target));
      const x = target.x - bounds.left;
      const y = target.y - bounds.top;
      const time = elapsed / 165;
      const radius = 8 + 16 * easeOut(time);
      context.globalAlpha = (1 - time) * .7;
      context.beginPath();
      context.ellipse(x, y, radius, radius * .75, 0, 0, Math.PI * 2);
      context.lineWidth = 1.7;
      context.strokeStyle = impact.target.kind === 'order' ? '#7caa6d' : '#fdfaee';
      context.stroke();
      for (let index = 0; index < 4; index++) {
        const angle = -.4 + index * 1.75;
        context.beginPath();
        context.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 1.7 * (1 - time) + .5, 0, Math.PI * 2);
        context.fillStyle = impact.target.kind === 'order' ? '#85ae73' : '#fff9e6';
        context.fill();
      }
      context.globalAlpha = 1;
    }
  }

  function resize() {
    if (destroyed) return;
    gesture = null;
    const bounds = scene.getBoundingClientRect();
    const fieldBounds = field.getBoundingClientRect();
    if (!fieldBounds.width || !fieldBounds.height) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    scale = fieldBounds.width / LOGICAL_WIDTH;
    width = bounds.width;
    height = bounds.height;
    fieldHeight = fieldBounds.height / scale;
    board.width = Math.ceil(fieldBounds.width * dpr);
    board.height = Math.ceil(fieldBounds.height * dpr);
    effects.width = Math.ceil(width * dpr);
    effects.height = Math.ceil(height * dpr);
    setFieldHeight(state, fieldHeight);
    drawBoard();
    drawEffects();
  }

  function duration(event: ActionEvent): number {
    if (motionPreference.matches) return 110;
    if (event.kind === 'transfer') return event.from.kind === 'tray' ? 275 : 230;
    if (event.kind === 'layer') return 205;
    return 280;
  }

  function screenOrigin(point: Point): Point {
    const bounds = scene.getBoundingClientRect();
    return { x: (point.x - bounds.left) / width, y: (point.y - bounds.top) / height };
  }

  function beginEvent(active: Sequence) {
    const event = active.events[active.index];
    if (event?.kind === 'layer') {
      hiddenLayer = null;
      newLayer = { trayId: event.trayId, started: active.started };
    }
    if (event?.kind === 'transfer') {
      if (event.from.kind === 'storage') {
        const slot = storageSlots[event.from.slot];
        active.flightSource = screenOrigin(midpoint(storageImages[event.from.slot].getBoundingClientRect()));
        slot.classList.add('outgoing');
      } else {
        active.flightSource = active.source;
      }
    }
    if (event?.kind === 'order') {
      orderCards[event.slot].classList.add('celebrating');
      options.onSound?.('complete');
    }
  }

  function endEvent(event: ActionEvent) {
    if (event.kind === 'transfer') {
      setPresentation(event.presentation);
      impact = { target: event.to, started: runningTime };
      options.onSound?.('delivery');
    }
    if (event.kind === 'order') {
      const card = orderCards[event.slot];
      card.classList.remove('celebrating');
      card.style.removeProperty('transform');
      card.style.removeProperty('opacity');
      setPresentation(event.presentation);
      if (!motionPreference.matches && event.replacement) {
        card.animate([{ transform: 'translateY(6px)', opacity: .65 }, { transform: 'none', opacity: 1 }], {
          duration: 165,
          easing: 'ease-out',
        });
      }
    }
    if (event.kind === 'layer') newLayer = null;
  }

  function resolveEvents() {
    while (sequence) {
      const event = sequence.events[sequence.index];
      const elapsed = runningTime - sequence.started;
      if (event && elapsed < duration(event)) {
        if (event.kind === 'order' && !motionPreference.matches) {
          const out = Math.max(0, (elapsed / duration(event) - .46) / .54);
          const card = orderCards[event.slot];
          card.style.transform = `translateY(${-13 * easeOut(out)}px) scale(${1 - .03 * out})`;
          card.style.opacity = String(1 - .9 * out);
        }
        return;
      }

      if (event) {
        endEvent(event);
        sequence.index += 1;
        sequence.started += duration(event);
      }

      if (sequence.index < sequence.events.length) {
        beginEvent(sequence);
        continue;
      }

      sequence = null;
      hiddenLayer = null;
      newLayer = null;
      board.removeAttribute('aria-busy');
      finishAction(state);
      if (state.status === 'won' || state.status === 'lost') {
        impact = null;
        pauseButton.disabled = true;
        board.tabIndex = -1;
        options.onResult(state.status, state);
      }
    }
  }

  function tick(time: number) {
    if (destroyed) return;
    const delta = lastFrame === null ? 0 : time - lastFrame;
    lastFrame = time;
    if (!paused && (state.status === 'playing' || state.status === 'resolving')) {
      advanceTime(state, delta);
      runningTime += delta;
      resolveEvents();
    }

    if (runningTime - hudTime > 90) {
      hudTime = runningTime;
      board.dataset.elapsedMs = state.elapsedMs.toFixed(1);
      board.dataset.columnOffsets = state.columns.map(column => column.offset.toFixed(2)).join(',');
    }
    drawBoard();
    drawEffects();
    if (!destroyed && !paused && (state.status === 'playing' || state.status === 'resolving')) {
      frame = requestAnimationFrame(tick);
    }
  }

  function play(slot: ProjectedSlot) {
    if (state.status !== 'playing') return;
    const bounds = field.getBoundingClientRect();
    const center = pointForSlot(slot);
    const source = screenOrigin({
      x: bounds.left + center.x * scale,
      y: bounds.top + Math.max(0, Math.min(fieldHeight, center.y)) * scale,
    });
    const tray = state.trays.find(item => item.id === slot.trayId);
    const previousPreview = tray ? previewLayer(tray) : null;
    const action = selectFood(state, slot.item.id, true);
    if (!action) return;

    board.setAttribute('aria-busy', 'true');
    board.classList.remove('pointing');
    sequence = {
      events: action.events,
      index: 0,
      started: runningTime,
      source,
      flightSource: source,
    };
    if (action.events.some(event => event.kind === 'layer')) hiddenLayer = { trayId: slot.trayId, previousPreview };
    options.onSound?.('select');
    options.onAction?.(action);
    beginEvent(sequence);
  }

  function logicalPoint(clientX: number, clientY: number): Point {
    const bounds = field.getBoundingClientRect();
    return { x: (clientX - bounds.left) / scale, y: (clientY - bounds.top) / scale };
  }

  board.addEventListener('pointerdown', event => {
    if (state.status !== 'playing' || event.button !== 0 || gesture) return;
    const point = logicalPoint(event.clientX, event.clientY);
    const slot = hitTest(projectTrays(state, fieldHeight), point, fieldHeight);
    if (!slot) return;
    gesture = { itemId: slot.item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: runningTime };
    keyboardId = null;
    if (event.isTrusted) board.setPointerCapture(event.pointerId);
  }, listener);

  board.addEventListener('pointermove', event => {
    if (gesture?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      gesture = null;
    }
    if (event.pointerType === 'mouse') {
      const point = logicalPoint(event.clientX, event.clientY);
      const pointing = state.status === 'playing' && !!hitTest(projectTrays(state, fieldHeight), point, fieldHeight);
      board.classList.toggle('pointing', pointing);
    }
  }, listener);

  board.addEventListener('pointerup', event => {
    const current = gesture;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture = null;
    if (state.status !== 'playing') return;
    const point = logicalPoint(event.clientX, event.clientY);
    const slots = projectTrays(state, fieldHeight);
    if (!matchesTap(current, { x: event.clientX, y: event.clientY }, point, slots, fieldHeight)) return;
    const slot = hitTest(slots, point, fieldHeight);
    if (slot) play(slot);
  }, listener);

  for (const eventName of ['pointercancel', 'lostpointercapture'] as const) {
    board.addEventListener(eventName, event => {
      if (gesture?.pointerId === event.pointerId) gesture = null;
    }, listener);
  }

  board.addEventListener('pointerleave', () => board.classList.remove('pointing'), listener);
  board.addEventListener('blur', () => { keyboardId = null; }, listener);
  board.addEventListener('keydown', event => {
    if (state.status !== 'playing') return;
    const navigation = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
    if (!navigation.includes(event.key) && event.key !== 'Enter' && event.key !== ' ') return;
    const slots = projectTrays(state, fieldHeight)
      .filter(slot => slot.y + slot.height > 0 && slot.y < fieldHeight)
      .sort((first, second) => first.x - second.x || first.y - second.y);
    if (!slots.length) return;
    event.preventDefault();
    const index = slots.findIndex(slot => slot.item.id === keyboardId);
    if (event.key === 'Enter' || event.key === ' ') {
      if (index >= 0) play(slots[index]);
      else keyboardId = slots[0].item.id;
      return;
    }
    const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const next = index < 0 ? 0 : (index + (backwards ? slots.length - 1 : 1)) % slots.length;
    keyboardId = slots[next].item.id;
    board.setAttribute('aria-label', `Выбрано блюдо: ${foodNames[slots[next].item.type]}. Отправить клавишей Enter.`);
  }, listener);

  pauseButton.addEventListener('click', options.onPause, listener);
  const observer = new ResizeObserver(resize);
  observer.observe(field);
  window.addEventListener('resize', resize, listener);
  setPresentation(state);
  resize();
  frame = requestAnimationFrame(tick);

  return {
    state,
    setPaused(value: boolean) {
      if (paused === value || destroyed) return;
      paused = value;
      gesture = null;
      setPaused(state, value);
      scene.toggleAttribute('data-paused', value);
      scene.getAnimations({ subtree: true }).forEach(animation => value ? animation.pause() : animation.play());
      lastFrame = null;
      cancelAnimationFrame(frame);
      if (!paused) frame = requestAnimationFrame(tick);
    },
    setHint(message: string) {
      hintText.textContent = message;
      hint.hidden = !message;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      listeners.abort();
      observer.disconnect();
      scene.remove();
    },
  };
}
