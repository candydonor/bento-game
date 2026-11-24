import { ITEMS_PER_ORDER, TRAY_PITCH } from './game.ts'
import type { ColumnConfig, Layer, Level, Tray } from './game.ts'

export const foodNames = {
  corndog: 'Кукурузный корндог',
  pancakes: 'Оладьи',
  maki: 'Маки',
  onigiri: 'Онигири',
  ube: 'Батончик убэ',
  sauce: 'Соус',
  tamago: 'Тамаго',
  matcha: 'Пирожное матча',
  dango: 'Данго',
  skewer: 'Овощная шпажка',
  tempura: 'Креветка темпура',
  curry: 'Карри',
} as const

export type FoodType = keyof typeof foodNames

type Slot = 0 | 1 | 2
type TrayLayout = Pick<Tray, 'columnIndex' | 'baseY'> & { slots: Slot[][] }
type LevelLayout = Pick<Level, 'id' | 'name' | 'description' | 'orders'> & {
  layout: TrayLayout[]
  phases: [number, number, number, number]
  rowsPerGroup: number
  speed?: number
}

const columns = [0, 1, 2, 3] as const
const slots = [0, 1, 2] as const

const tutorialLayers: Slot[][][] = [
  [[0, 1, 2], [0, 1, 2]],
  [[0, 1, 2], [0, 2]],
  [[0, 1, 2], [1, 2]],
  [[0, 1, 2]],
  [[0, 2], [0, 1]],
  [[0, 1, 2], [0, 1, 2]],
  [[0, 1], [0, 2]],
  [[0, 1, 2]],
]

const tutorial: LevelLayout = {
  id: 1,
  name: 'Обучение',
  description: 'Разберись с лотками и выполни 12 заказов.',
  layout: tutorialLayers.map((slots, index) => ({
    columnIndex: columns[index % columns.length],
    baseY: Math.floor(index / columns.length) * TRAY_PITCH * 2.5,
    slots,
  })),
  phases: [13, 37, 8, 28],
  rowsPerGroup: 2,
  orders: [
    'maki', 'pancakes', 'corndog', 'onigiri', 'dango', 'ube',
    'onigiri', 'maki', 'ube', 'corndog', 'pancakes', 'dango',
  ],
}

function mainLayout(): TrayLayout[] {
  const depths = [3, 2, 3, 4, 2, 3, 2, 4, 2, 3]
  const layerCount = columns.length * depths.reduce((sum, depth) => sum + depth, 0)
  let ordinal = 0

  return depths.flatMap((_, row) => columns.map(columnIndex => ({
    columnIndex,
    baseY: row * TRAY_PITCH,
    slots: Array.from({ length: depths[(row + columnIndex * 3) % depths.length] }, () => {
      // Permute the layer ordinals to spread full and sparse plates across all rows.
      const pattern = ordinal * 37 % layerCount
      const gap = slots[ordinal % slots.length]
      ordinal += 1
      if (pattern < 24) return [...slots]
      if (pattern < 32) return [gap]
      return slots.filter(slot => slot !== gap)
    }),
  })))
}

const main: LevelLayout = {
  id: 2,
  name: 'Основной',
  description: 'Двенадцать блюд, четыре ленты и 80 заказов.',
  layout: mainLayout(),
  phases: [13, 30, 7, 23],
  rowsPerGroup: 3,
  orders: [
    'maki', 'tamago', 'tempura', 'onigiri', 'pancakes', 'dango', 'sauce', 'corndog', 'skewer', 'matcha', 'ube', 'curry',
    'onigiri', 'maki', 'curry', 'matcha', 'skewer', 'sauce', 'dango', 'tempura', 'tamago', 'corndog', 'ube', 'pancakes',
    'tempura', 'tamago', 'matcha', 'onigiri', 'ube', 'curry', 'pancakes', 'maki', 'corndog', 'dango', 'skewer', 'sauce',
    'pancakes', 'skewer', 'curry', 'ube', 'dango', 'tempura', 'corndog', 'maki', 'sauce', 'matcha', 'tamago', 'onigiri',
    'ube', 'corndog', 'pancakes', 'tamago', 'dango', 'maki', 'matcha', 'tempura', 'skewer', 'curry', 'onigiri', 'sauce',
    'dango', 'tempura', 'sauce', 'curry', 'tamago', 'skewer', 'maki', 'matcha', 'onigiri', 'pancakes', 'ube', 'corndog',
    'matcha', 'corndog', 'tempura', 'ube', 'dango', 'maki', 'onigiri', 'tamago',
  ],
}

const extendedLevels = [
  { id: 3, name: 'Обеденный час', orderCount: 140, speed: 17 },
  { id: 4, name: 'Полный зал', orderCount: 220, speed: 19 },
  { id: 5, name: 'Вечерняя смена', orderCount: 320, speed: 21 },
  { id: 6, name: 'Праздничный стол', orderCount: 450, speed: 23 },
  { id: 7, name: 'Большой банкет', orderCount: 600, speed: 25 },
]

function extendedLayout({ id, name, orderCount, speed }: typeof extendedLevels[number]): LevelLayout {
  const foodTypes = Object.keys(foodNames) as FoodType[]
  const orderStrides = [1, 5, 7, 11]
  const orders = Array.from({ length: orderCount }, (_, index) => {
    // Each full round serves all twelve dishes. A round changes its starting
    // dish and traversal order, so the queues can differ between levels.
    const round = Math.floor(index / foodTypes.length)
    const stride = orderStrides[(round + id) % orderStrides.length]
    return foodTypes[(id * 2 + round * 5 + index % foodTypes.length * stride) % foodTypes.length]
  })

  // Keep the belts short even for the longest queues by using deeper trays.
  const rowCount = 6
  const trayCount = rowCount * columns.length
  const itemCount = orderCount * ITEMS_PER_ORDER
  const baseCapacity = Math.floor(itemCount / trayCount)
  const extraItems = itemCount % trayCount
  const layout = Array.from({ length: trayCount }, (_, index): TrayLayout => {
    const row = Math.floor(index / columns.length)
    const columnIndex = columns[index % columns.length]
    const extra = (index * 5 + id * 11) % trayCount < extraItems ? 1 : 0
    const capacity = baseCapacity + extra
    const layers: Slot[][] = []
    let remaining = capacity
    while (remaining > 0) {
      const depth = layers.length
      const preferredCount = (depth + row + columnIndex) % 5 === 1 ? 2 : 3
      const count = Math.min(remaining, preferredCount)
      const first = (id + row * 2 + columnIndex + depth) % slots.length
      layers.push(Array.from({ length: count }, (_, slot) => slots[(first + slot) % slots.length]))
      remaining -= count
    }
    return { columnIndex, baseY: row * TRAY_PITCH, slots: layers }
  })

  return {
    id,
    name,
    description: `Двенадцать блюд и ${orderCount} заказов.`,
    layout,
    phases: [10 + id, 31 - id, 6 + id, 26 + id],
    rowsPerGroup: 1,
    speed,
    orders,
  }
}

function buildLevel(config: LevelLayout): Level {
  const { id, name, description, layout, orders, phases, rowsPerGroup, speed = 15 } = config
  const trays: Tray[] = layout.map(({ columnIndex, baseY, slots }, index) => ({
    id: `${id}-tray-${index + 1}`,
    columnIndex,
    baseY,
    activeLayerIndex: 0,
    layers: slots.map((): Layer => [null, null, null]),
  }))
  const movingColumns: ColumnConfig[] = columns.map(index => ({
    index,
    direction: index % 2 === 0 ? -1 : 1,
    speed,
    initialOffset: phases[index],
  }))

  // Reserve one item from the first queued order for an early trip to storage.
  // The rest of the solution follows the finite order queue.
  const firstQueued = columns.length
  const solutionTypes = orders.flatMap((type, index) => Array<FoodType>(
    index === firstQueued ? ITEMS_PER_ORDER - 1 : ITEMS_PER_ORDER,
  ).fill(type))
  solutionTypes.splice(1, 0, orders[firstQueued])

  const witness: string[] = []
  const groupSize = columns.length * rowsPerGroup
  for (let start = 0; start < layout.length; start += groupSize) {
    const group = layout.slice(start, start + groupSize)
    const deepest = Math.max(...group.map(tray => tray.slots.length))
    // Fill one depth at a time in each group so following the witness always
    // exposes the next item before it is needed.
    for (let depth = 0; depth < deepest; depth += 1) {
      for (const slot of slots) {
        for (const [index, recipe] of group.entries()) {
          if (!recipe.slots[depth]?.includes(slot)) continue

          const tray = trays[start + index]
          const type = solutionTypes[witness.length]
          if (!type) throw new Error(`Too many food positions in level ${id}`)

          const itemId = `${tray.id}-${depth}-${slot}`
          tray.layers[depth][slot] = { id: itemId, type }
          witness.push(itemId)
        }
      }
    }
  }
  if (witness.length !== solutionTypes.length) throw new Error(`Too few food positions in level ${id}`)

  return { id, name, description, trays, columns: movingColumns, orders, witness }
}

export const levels = [tutorial, main, ...extendedLevels.map(extendedLayout)].map(buildLevel)
