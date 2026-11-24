import type { FoodType } from './levels.ts'

export type { FoodType } from './levels.ts'

export const LOGICAL_WIDTH = 390
export const TRAY_PITCH = 110
export const ORDER_SLOTS = 4
export const ITEMS_PER_ORDER = 3
export const STORAGE_SLOTS = 5

type ColumnIndex = 0 | 1 | 2 | 3
type Outcome = 'playing' | 'won' | 'lost'
type ActiveStatus = 'playing' | 'resolving'

export type FoodItem = Readonly<{ id: string; type: FoodType }>
export type Layer = [FoodItem | null, FoodItem | null, FoodItem | null]

export type Tray = {
  id: string
  columnIndex: ColumnIndex
  baseY: number
  layers: Layer[]
  activeLayerIndex: number
}

export type ColumnConfig = {
  index: ColumnIndex
  direction: -1 | 1
  speed: number
  initialOffset: number
}

export type MovingColumn = ColumnConfig & { offset: number; loopHeight: number }

export type Order = {
  id: string
  foodType: FoodType
  required: typeof ITEMS_PER_ORDER
  collected: number
}

export type Level = {
  id: number
  name: string
  description: string
  trays: Tray[]
  columns: ColumnConfig[]
  orders: FoodType[]
  witness: string[]
}

export type Presentation = {
  orders: (Order | null)[]
  storage: FoodItem[]
  completedOrders: number
}

export type Game = Presentation & {
  level: Level
  trays: Tray[]
  columns: MovingColumn[]
  nextOrderIndex: number
  elapsedMs: number
  status: Outcome | 'resolving' | 'paused'
  statusBeforePause: ActiveStatus
  pendingOutcome: Outcome
}

type StoragePosition = { kind: 'storage'; slot: number }

export type TransferEvent = {
  kind: 'transfer'
  item: FoodItem
  from: { kind: 'tray'; trayId: string; slot: number } | StoragePosition
  to: { kind: 'order'; slot: number; position: number } | StoragePosition
  presentation: Presentation
}

export type LayerEvent = { kind: 'layer'; trayId: string; index: number }

export type OrderEvent = {
  kind: 'order'
  slot: number
  completed: Order
  replacement: Order | null
  presentation: Presentation
}

export type ActionEvent = TransferEvent | LayerEvent | OrderEvent

export type Action = {
  before: Presentation
  events: ActionEvent[]
  outcome: Outcome
}

function nonemptyLayerIndex(tray: Tray, from: number): number {
  const index = tray.layers.findIndex((layer, index) => index >= from && layer.some(Boolean))
  return index < 0 ? tray.layers.length : index
}

export function activeLayer(tray: Tray): Layer | null {
  return tray.layers[tray.activeLayerIndex] ?? null
}

export function previewLayer(tray: Tray): Layer | null {
  const index = nonemptyLayerIndex(tray, tray.activeLayerIndex + 1)
  return tray.layers[index] ?? null
}

function nextOrder(game: Game): Order | null {
  const index = game.nextOrderIndex
  const foodType = game.level.orders[index]
  if (foodType === undefined) return null

  game.nextOrderIndex += 1
  return { id: `${game.level.id}-order-${index + 1}`, foodType, required: ITEMS_PER_ORDER, collected: 0 }
}

export function createGame(level: Level): Game {
  const trays = level.trays.map(tray => {
    const copy = { ...tray, layers: tray.layers.map(([left, middle, right]): Layer => [left, middle, right]) }
    copy.activeLayerIndex = nonemptyLayerIndex(copy, 0)
    return copy
  })
  const game: Game = {
    level,
    trays,
    columns: level.columns.map(config => ({ ...config, offset: config.initialOffset, loopHeight: TRAY_PITCH })),
    orders: [],
    storage: [],
    completedOrders: 0,
    nextOrderIndex: 0,
    elapsedMs: 0,
    status: 'playing',
    statusBeforePause: 'playing',
    pendingOutcome: 'playing',
  }
  game.orders = Array.from({ length: ORDER_SLOTS }, () => nextOrder(game))
  setFieldHeight(game, LOGICAL_WIDTH)
  return game
}

export function setFieldHeight(game: Game, fieldHeight: number): void {
  for (const column of game.columns) {
    const contentHeight = game.trays.reduce((height, tray) => {
      return tray.columnIndex === column.index ? Math.max(height, tray.baseY + TRAY_PITCH) : height
    }, TRAY_PITCH)
    column.loopHeight = Math.max(contentHeight, fieldHeight + TRAY_PITCH)
  }
}

export function trayY(game: Game, tray: Tray): number {
  const { offset, loopHeight } = game.columns[tray.columnIndex]
  const position = tray.baseY + offset + TRAY_PITCH
  return ((position % loopHeight + loopHeight) % loopHeight) - TRAY_PITCH
}

export function advanceTime(game: Game, elapsedMs: number): void {
  if (game.status !== 'playing' && game.status !== 'resolving') return

  game.elapsedMs += elapsedMs
  for (const column of game.columns) {
    column.offset = column.initialOffset + column.direction * column.speed * game.elapsedMs / 1000
  }
}

export function setPaused(game: Game, paused: boolean): void {
  if (paused && (game.status === 'playing' || game.status === 'resolving')) {
    game.statusBeforePause = game.status
    game.status = 'paused'
  } else if (!paused && game.status === 'paused') {
    game.status = game.statusBeforePause
  }
}

function snapshot(game: Game): Presentation {
  return {
    orders: game.orders.map(order => order ? { ...order } : null),
    storage: [...game.storage],
    completedOrders: game.completedOrders,
  }
}

function orderSlot(game: Game, item: FoodItem): number {
  return game.orders.findIndex(order => order?.foodType === item.type && order.collected < order.required)
}

function receive(game: Game, item: FoodItem, targetOrder: number, from: TransferEvent['from']): TransferEvent {
  const order = game.orders[targetOrder]
  let to: TransferEvent['to']
  if (order) {
    to = { kind: 'order', slot: targetOrder, position: order.collected }
    order.collected += 1
  } else {
    to = { kind: 'storage', slot: game.storage.length }
    game.storage.push(item)
  }
  return { kind: 'transfer', item, from, to, presentation: snapshot(game) }
}

function replaceCompletedOrder(game: Game, slot: number, events: ActionEvent[]): void {
  const completed = game.orders[slot]
  if (!completed || completed.collected < completed.required) return

  game.completedOrders += 1
  const replacement = nextOrder(game)
  game.orders[slot] = replacement
  events.push({
    kind: 'order',
    slot,
    completed,
    replacement: replacement ? { ...replacement } : null,
    presentation: snapshot(game),
  })
}

function drainStorage(game: Game, events: ActionEvent[]): void {
  for (let slot = 0; slot < game.storage.length;) {
    const item = game.storage[slot]
    const targetOrder = orderSlot(game, item)
    if (targetOrder < 0) {
      slot += 1
      continue
    }

    game.storage.splice(slot, 1)
    events.push(receive(game, item, targetOrder, { kind: 'storage', slot }))
    replaceCompletedOrder(game, targetOrder, events)
    // A replacement can make a previously skipped item eligible.
    slot = 0
  }
}

function result(game: Game): Outcome {
  const finishedOrders = game.nextOrderIndex === game.level.orders.length && game.orders.every(order => !order)
  const noRemainingFood = game.storage.length === 0 && game.trays.every(tray => activeLayer(tray) === null)
  if (finishedOrders && noRemainingFood) return 'won'
  return game.storage.length >= STORAGE_SLOTS ? 'lost' : 'playing'
}

export function selectFood(game: Game, itemId: string, visible: boolean): Action | null {
  if (game.status !== 'playing' || !visible) return null

  const tray = game.trays.find(tray => activeLayer(tray)?.some(item => item?.id === itemId))
  const layer = tray && activeLayer(tray)
  if (!tray || !layer) return null

  const slot = layer.findIndex(item => item?.id === itemId)
  const item = layer[slot]
  if (!item) return null

  const before = snapshot(game)
  const targetOrder = orderSlot(game, item)
  game.status = 'resolving'
  layer[slot] = null

  const events: ActionEvent[] = []
  if (layer.every(position => position === null)) {
    tray.activeLayerIndex = nonemptyLayerIndex(tray, tray.activeLayerIndex + 1)
    events.push({ kind: 'layer', trayId: tray.id, index: tray.activeLayerIndex })
  }

  // Presentation starts with the selected item in flight, then reveals the layer.
  events.unshift(receive(game, item, targetOrder, { kind: 'tray', trayId: tray.id, slot }))
  replaceCompletedOrder(game, targetOrder, events)
  drainStorage(game, events)
  const outcome = result(game)
  game.pendingOutcome = outcome
  return { before, events, outcome }
}

export function finishAction(game: Game): void {
  if (game.status === 'resolving') game.status = game.pendingOutcome
}
