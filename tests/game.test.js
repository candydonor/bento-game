import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeLayer,
  advanceTime,
  createGame,
  finishAction,
  previewLayer,
  selectFood,
  setFieldHeight,
  setPaused,
  trayY,
} from '../src/game.ts';
import { hitTest, matchesTap, projectTrays } from '../src/geometry.ts';
import { levels } from '../src/levels.ts';

const [a, b, c, d, e, f] = [...new Set(levels[0].orders)];
const directions = [-1, 1, -1, 1];
const fieldHeight = 420;

function food(id, type) {
  return { id, type };
}

function tray(id, layers, columnIndex = 0, baseY = 80) {
  return { id, layers, columnIndex, baseY, activeLayerIndex: 0 };
}

function fixture(orders, trays) {
  return {
    id: 99,
    name: 'Проверка движка',
    description: '',
    orders,
    trays,
    columns: directions.map((direction, index) => ({
      index, direction, speed: 15, initialOffset: 16 + 5 * index,
    })),
    witness: [],
  };
}

function newGame(orders, trays, height = fieldHeight) {
  const game = createGame(fixture(orders, trays));
  setFieldHeight(game, height);
  return game;
}

function allFood(trays) {
  return trays.flatMap(({ layers }) => layers.flat().filter(Boolean));
}

function assertBalance(game) {
  const remaining = allFood(game.trays).length;
  const inProgress = game.orders.reduce((sum, order) => sum + (order?.collected ?? 0), 0);
  const expected = allFood(game.level.trays).length;
  assert.equal(remaining + game.storage.length + inProgress + 3 * game.completedOrders, expected);
}

function perform(game, id, visible = true) {
  const action = selectFood(game, id, visible);
  assert.ok(action, `Expected an accepted selection of ${id}`);
  assert.equal(game.status, 'resolving');
  assertBalance(game);
  finishAction(game);
  assert.equal(game.status, action.outcome);
  assertBalance(game);
  return action;
}

function itemIds(items) {
  return items.map(item => item?.id ?? null);
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);
}

function visibleCenter(slot, height) {
  return {
    x: slot.x + slot.width / 2,
    y: (Math.max(0, slot.y) + Math.min(height, slot.y + slot.height)) / 2,
  };
}

test('the first four orders start empty and matching food goes to the leftmost order', () => {
  const game = newGame([a, a, b, c, d], [tray('upper', [[food('one', a), null, null]])]);
  assert.deepEqual(game.orders.map(order => [order.foodType, order.collected]), [
    [a, 0], [a, 0], [b, 0], [c, 0],
  ]);
  assert.equal(game.nextOrderIndex, 4);
  assert.deepEqual(game.storage, []);

  const action = perform(game, 'one');
  assert.deepEqual(game.orders.map(order => order.collected), [1, 0, 0, 0]);
  assert.deepEqual(game.storage, []);
  assert.deepEqual(action.events.find(event => event.kind === 'transfer').to, {
    kind: 'order', slot: 0, position: 0,
  });
});

test('unmatched selections occupy one storage slot each, including three identical items', () => {
  const game = newGame([a, b, c, d], [
    tray('upper', [[food('one', e), food('two', e), food('three', e)]]),
  ]);
  for (const [index, id] of ['one', 'two', 'three'].entries()) {
    const action = perform(game, id);
    assert.deepEqual(action.events.find(event => event.kind === 'transfer').to, {
      kind: 'storage', slot: index,
    });
    assert.equal(game.storage.length, index + 1);
  }

  assert.deepEqual(itemIds(game.storage), ['one', 'two', 'three']);
  assert.equal(game.completedOrders, 0);
  assert.equal(game.status, 'playing');
});

test('a layer stays closed until the current layer is empty and skips empty layers', () => {
  const empty = [null, null, null];
  const game = newGame([a, b, c, d], [tray('upper', [
    empty,
    [food('one', a), food('two', b), null],
    empty,
    [null, food('near', c), food('near-too', d)],
    [food('deep', a), null, null],
  ])]);
  const upper = game.trays[0];

  assert.equal(upper.activeLayerIndex, 1);
  assert.deepEqual(itemIds(previewLayer(upper)), [null, 'near', 'near-too']);
  assert.equal(selectFood(game, 'near', true), null);

  perform(game, 'one');
  assert.equal(upper.activeLayerIndex, 1);
  assert.deepEqual(itemIds(activeLayer(upper)), [null, 'two', null]);
  assert.equal(selectFood(game, 'near', true), null);

  const action = perform(game, 'two');
  assert.deepEqual(
    action.events.filter(event => event.kind === 'layer').map(event => event.index),
    [3],
  );
  assert.equal(upper.activeLayerIndex, 3);
  assert.deepEqual(itemIds(activeLayer(upper)), [null, 'near', 'near-too']);
  assert.deepEqual(itemIds(previewLayer(upper)), ['deep', null, null]);
  assert.equal(selectFood(game, 'deep', true), null);
});

test('an order replacement can complete a second order and fill the following one', () => {
  const game = newGame([a, d, e, f, b, c], [
    tray('storage-food', [
      [food('b-1', b), food('c-1', c), food('b-2', b)],
      [food('b-3', b), null, null],
    ]),
    tray('first-order', [[food('a-1', a), food('a-2', a), food('a-3', a)]]),
  ]);
  const otherOrderIds = game.orders.slice(1).map(order => order.id);

  for (const id of ['b-1', 'c-1', 'b-2', 'b-3', 'a-1', 'a-2']) perform(game, id);
  const action = perform(game, 'a-3');

  assert.equal(game.completedOrders, 2);
  assert.equal(game.nextOrderIndex, 6);
  assert.deepEqual(game.orders.slice(1).map(order => order.id), otherOrderIds);
  assert.equal(game.orders[0].foodType, c);
  assert.equal(game.orders[0].collected, 1);
  assert.deepEqual(game.storage, []);
  const replacements = action.events.filter(event => event.kind === 'order');
  assert.deepEqual(replacements.map(event => event.slot), [0, 0]);
  assert.deepEqual(replacements.map(event => event.replacement.foodType), [b, c]);

  const transfers = action.events.filter(event => event.kind === 'transfer' && event.from.kind === 'storage');
  assert.deepEqual(transfers.map(event => event.item.id), ['b-1', 'b-2', 'b-3', 'c-1']);
  assert.deepEqual(transfers.map(event => event.from.slot), [0, 1, 1, 0]);
});

test('storage compacts left in the original relative order after an automatic transfer', () => {
  const game = newGame([a, d, e, f, b], [
    tray('storage-food', [
      [food('c-first', c), food('b-only', b), food('c-second', c)],
      [food('c-third', c), null, null],
    ]),
    tray('first-order', [[food('a-1', a), food('a-2', a), food('a-3', a)]]),
  ]);

  for (const id of ['c-first', 'b-only', 'c-second', 'c-third', 'a-1', 'a-2', 'a-3']) {
    perform(game, id);
  }

  assert.deepEqual(itemIds(game.storage), ['c-first', 'c-second', 'c-third']);
  assert.equal(game.orders[0].foodType, b);
  assert.equal(game.orders[0].collected, 1);
});

test('a full storage causes defeat only if it remains full after automatic transfers', () => {
  const game = newGame([a, b, c, d], [
    tray('new', [[food('last', e), null, null]]),
    tray('already-stored', [
      [food('a-1', a), food('e-1', e), food('a-2', a)],
      [food('f-1', f), null, null],
    ]),
  ]);

  // Seed the matching inventory of an intermediate state before automatic resolution.
  const stagedTray = game.trays[1];
  game.storage.push(...allFood([stagedTray]));
  for (const layer of stagedTray.layers) layer.fill(null);
  assertBalance(game);

  const action = perform(game, 'last');
  assert.deepEqual(action.events.find(event => event.kind === 'transfer').to, {
    kind: 'storage', slot: 4,
  });
  assert.equal(game.status, 'playing');
  assert.deepEqual(itemIds(game.storage), ['e-1', 'f-1', 'last']);
  assert.equal(game.orders[0].collected, 2);

  const losingGame = newGame([a, b, c, d], [
    tray('unmatched', [
      [food('e-1', e), food('e-2', e), food('e-3', e)],
      [food('e-4', e), food('e-5', e), food('e-6', e)],
    ]),
  ]);
  for (const number of [1, 2, 3, 4, 5]) perform(losingGame, `e-${number}`);

  assert.equal(losingGame.status, 'lost');
  assert.equal(losingGame.storage.length, 5);
  assert.equal(selectFood(losingGame, 'e-6', true), null);
  const elapsed = losingGame.elapsedMs;
  advanceTime(losingGame, 500);
  assert.equal(losingGame.elapsedMs, elapsed);
});

test('hidden, duplicate and in-flight selections cannot change food or order counts', () => {
  const game = newGame([a], [tray('upper', [[food('one', a), food('two', a), food('three', a)]])]);
  assert.equal(selectFood(game, 'one', false), null);
  assert.equal(selectFood(game, 'not-here', true), null);
  assert.deepEqual(itemIds(activeLayer(game.trays[0])), ['one', 'two', 'three']);

  const action = selectFood(game, 'one', true);
  assert.ok(action);
  assert.equal(selectFood(game, 'one', true), null);
  assert.equal(selectFood(game, 'two', true), null);
  assertBalance(game);
  finishAction(game);
  assert.equal(selectFood(game, 'one', true), null);
  assert.equal(game.orders[0].collected, 1);
  assert.deepEqual(itemIds(activeLayer(game.trays[0])), [null, 'two', 'three']);

  perform(game, 'two');
  perform(game, 'three');
  assert.equal(game.status, 'won');
  assert.equal(game.completedOrders, 1);
  assert.ok(game.orders.every(order => order === null));
  assert.equal(allFood(game.trays).length, 0);
  assert.equal(game.storage.length, 0);
});

test('independent columns move up/down by elapsed time at different frame frequencies', () => {
  const trays = directions.map((_, index) => tray(
    `column-${index}`, [[food(`item-${index}`, a), null, null]], index,
  ));
  const fastFrames = newGame([a], trays);
  const slowFrames = newGame([a], trays);
  const start = fastFrames.trays.map(itemTray => trayY(fastFrames, itemTray));
  for (const _ of Array(120)) advanceTime(fastFrames, 1000 / 120);
  for (const _ of Array(24)) advanceTime(slowFrames, 1000 / 24);

  for (const [index, direction] of directions.entries()) {
    const fastY = trayY(fastFrames, fastFrames.trays[index]);
    const slowY = trayY(slowFrames, slowFrames.trays[index]);
    near(fastY - start[index], direction * 15);
    near(slowY, fastY);
  }
  near(fastFrames.elapsedMs, 1000);
  near(slowFrames.elapsedMs, 1000);
});

test('action and automatic resolution move the columns while pause freezes the game clock', () => {
  const game = newGame([a, d, e, f, b], [
    tray('first', [[food('a-1', a), food('a-2', a), food('a-3', a)]]),
    tray('stored', [[food('b-1', b), null, null]], 1),
  ]);
  for (const id of ['b-1', 'a-1', 'a-2']) perform(game, id);
  const start = trayY(game, game.trays[0]);
  const action = selectFood(game, 'a-3', true);
  assert.ok(action.events.some(event => event.kind === 'transfer' && event.from.kind === 'storage'));
  advanceTime(game, 100);
  near(trayY(game, game.trays[0]), start - 1.5);

  setPaused(game, true);
  assert.equal(game.status, 'paused');
  const pausedOffsets = game.columns.map(column => column.offset);
  advanceTime(game, 20_000);
  assert.deepEqual(game.columns.map(column => column.offset), pausedOffsets);
  assert.equal(game.elapsedMs, 100);

  setPaused(game, false);
  assert.equal(game.status, 'resolving');
  advanceTime(game, 300);
  assert.equal(game.elapsedMs, 400);
  near(trayY(game, game.trays[0]), start - 6);
  finishAction(game);
  assert.equal(game.status, 'playing');
  assertBalance(game);
});

test('one full column cycle preserves the tray, its opened layer and remaining food', () => {
  const game = newGame([a, b], [
    tray('traveling', [
      [food('early', a), null, null],
      [food('remaining', b), null, null],
    ]),
  ]);
  perform(game, 'early');
  const traveling = game.trays[0];
  const start = trayY(game, traveling);
  const column = game.columns[0];
  const cycleTime = 1000 * column.loopHeight / column.speed;
  assert.ok(column.loopHeight > fieldHeight);
  advanceTime(game, cycleTime / 2);
  assert.notEqual(trayY(game, traveling), start);
  advanceTime(game, cycleTime / 2);

  near(trayY(game, traveling), start);
  assert.equal(game.trays[0], traveling);
  assert.equal(traveling.id, 'traveling');
  assert.equal(traveling.activeLayerIndex, 1);
  assert.deepEqual(itemIds(activeLayer(traveling)), ['remaining', null, null]);
  assert.equal(projectTrays(game, fieldHeight).filter(slot => slot.item.id === 'remaining').length, 1);
  assertBalance(game);
});

test('starting a new attempt restores orders, storage, layers, clock and column phases', () => {
  const level = fixture([a, b, c, d], [tray('reusable', [
    [food('stored', e), food('ordered', a), null],
    [food('next', b), null, null],
  ])]);
  const previous = createGame(level);
  const initialOffsets = previous.columns.map(column => column.offset);
  perform(previous, 'stored');
  perform(previous, 'ordered');
  advanceTime(previous, 5000);
  assert.equal(previous.trays[0].activeLayerIndex, 1);
  assert.equal(previous.storage.length, 1);

  const restarted = createGame(level);
  assert.equal(restarted.status, 'playing');
  assert.equal(restarted.elapsedMs, 0);
  assert.equal(restarted.completedOrders, 0);
  assert.equal(restarted.nextOrderIndex, 4);
  assert.deepEqual(restarted.orders.map(order => order.collected), [0, 0, 0, 0]);
  assert.deepEqual(restarted.storage, []);
  assert.deepEqual(restarted.columns.map(column => column.offset), initialOffsets);
  assert.equal(restarted.trays[0].activeLayerIndex, 0);
  assert.deepEqual(itemIds(activeLayer(restarted.trays[0])), ['stored', 'ordered', null]);
  assert.deepEqual(itemIds(previewLayer(restarted.trays[0])), ['next', null, null]);
  assertBalance(restarted);
});

test('a held pointer cannot select the different item that drifts into its position', () => {
  const game = newGame([a, b], [
    tray('first', [[food('first', a), null, null]], 0, 8),
    tray('following', [[food('following', b), null, null]], 0, 110),
  ], 320);
  const height = 320;
  const initial = projectTrays(game, height);
  const first = initial.find(slot => slot.item.id === 'first');
  const following = initial.find(slot => slot.item.id === 'following');
  assert.ok(first && following);
  const point = visibleCenter(first, height);
  const gesture = { ...point, itemId: 'first' };

  assert.equal(hitTest(initial, point, height)?.item.id, 'first');
  assert.equal(matchesTap(gesture, point, point, initial, height), true);
  assert.equal(matchesTap(gesture, { x: point.x + 9, y: point.y }, point, initial, height), false);
  assert.equal(hitTest(initial, { x: point.x, y: -1 }, height), null);

  advanceTime(game, 1000 * (following.y - first.y) / game.columns[0].speed);
  const later = projectTrays(game, height);
  assert.equal(hitTest(later, point, height)?.item.id, 'following');
  assert.equal(matchesTap(gesture, point, point, later, height), false);
  assert.equal(later.some(slot => slot.item.id === 'first'), false);
  assert.equal(game.orders[0].collected, 0);
});

function waitForWitnessItem(game, id, height) {
  const stepMs = 333;
  const fullRotationMs = Math.max(...game.columns.map(column => 1000 * column.loopHeight / column.speed));
  for (let elapsed = 0; elapsed <= fullRotationMs + stepMs; elapsed += stepMs) {
    const slots = projectTrays(game, height);
    const slot = slots.find(candidate => candidate.item.id === id);
    if (slot) {
      const point = visibleCenter(slot, height);
      if (hitTest(slots, point, height)?.item.id === id) return true;
    }
    advanceTime(game, stepMs);
  }
  return false;
}

const expectedLevels = [
  { tr: 8, foods: 6, items: 36, orders: 12, minLayers: 1, maxLayers: 2 },
  { tr: 40, foods: 12, items: 240, orders: 80, minLayers: 2, maxLayers: 4 },
];

for (const [index, expected] of expectedLevels.entries()) {
  test(`level ${index + 1} has the specified inventory and completes its witness through visible taps`, () => {
    const level = levels[index];
    const items = allFood(level.trays);
    assert.equal(level.trays.length, expected.tr);
    assert.deepEqual(level.columns.map(column => column.direction), directions);
    assert.equal(items.length, expected.items);
    assert.equal(new Set(items.map(item => item.id)).size, expected.items);
    assert.equal(level.orders.length, expected.orders);
    assert.equal(new Set(level.orders).size, expected.foods);
    assert.equal(level.witness.length, expected.items);
    assert.equal(new Set(level.witness).size, expected.items);

    const types = new Set([...items.map(item => item.type), ...level.orders]);
    for (const type of types) {
      assert.equal(items.filter(item => item.type === type).length,
        3 * level.orders.filter(foodType => foodType === type).length);
    }
    for (const itemTray of level.trays) {
      assert.ok(itemTray.layers.length >= expected.minLayers && itemTray.layers.length <= expected.maxLayers);
      assert.ok(itemTray.layers.every(layer => layer.length === 3));
    }

    const height = 640;
    const game = createGame(level);
    setFieldHeight(game, height);
    if (index === 0) {
      assert.ok(projectTrays(game, height).some(slot => game.orders.some(order => order?.foodType === slot.item.type)));
    }

    for (const [actionIndex, id] of level.witness.entries()) {
      assert.ok(waitForWitnessItem(game, id, height), `Witness step ${actionIndex + 1}: ${id} did not become selectable`);
      perform(game, id);
      assert.ok(game.storage.length < 5, `Witness filled storage at step ${actionIndex + 1}`);
    }

    assert.equal(game.status, 'won');
    assert.equal(game.completedOrders, expected.orders);
    assert.equal(game.nextOrderIndex, expected.orders);
    assert.ok(game.orders.every(order => order === null));
    assert.deepEqual(game.storage, []);
    assert.deepEqual(allFood(game.trays), []);
  });
}
