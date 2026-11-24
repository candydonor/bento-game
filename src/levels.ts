import { ITEMS_PER_ORDER, ORDER_SLOTS, TRAY_PITCH } from './game.ts'
import type { ColumnConfig, Layer, Level, Tray } from './game.ts'

// Dishes are ordered by the level at which they join the menu.
export const foodNames = {
  corndog: 'Корндог',
  pancakes: 'Оладьи с кунжутом',
  maki: 'Роллы с лососем',
  onigiri: 'Онигири',
  ube: 'Фиолетовые пирожные',
  sauce: 'Напиток с зелёной крышкой',
  tamago: 'Тамаго',
  matcha: 'Пирожные матча',
  dango: 'Данго',
  skewer: 'Шашлычок с зелёным перцем',
  tempura: 'Хрустящая куриная ножка',
  curry: 'Токпокки',

  'green-roll': 'Зелёный рулет',
  'pink-flower': 'Цветочные вагаси',
  'soft-serve': 'Мягкое мороженое',
  'sausage-skewer': 'Сосиски на шпажке',
  dumplings: 'Паровые булочки',
  'red-cabbage': 'Капустные свёртки',

  'green-square': 'Бисквит матча',
  'glazed-dango': 'Данго в глазури',
  kimbap: 'Кимбап',
  'sakura-mochi': 'Сакура-моти',
  'milk-drink': 'Молочный напиток',
  'yellow-skewer': 'Жёлтая шпажка',

  'strawberry-mochi': 'Клубничное моти',
  'fish-cakes': 'Тайяки',
  'green-onigiri': 'Зелёное онигири',
  'chocolate-toast': 'Шоколадный тост',
  parfait: 'Парфе',
  'orange-cups': 'Апельсиновый десерт',

  inari: 'Инари',
  'colorful-buns': 'Цветные булочки',
  musubi: 'Мусуби',
  'layered-strips': 'Слоёные полоски',
  dorayaki: 'Дораяки',
} as const

export type FoodType = keyof typeof foodNames

type Slot = 0 | 1 | 2
type TrayLayout = Pick<Tray, 'columnIndex' | 'baseY'> & { slots: Slot[][] }
type ColumnPhases = [number, number, number, number]
type LevelLayout = Pick<Level, 'id' | 'name' | 'description' | 'orders'> & {
  layout: TrayLayout[]
  phases: ColumnPhases
  rowsPerGroup: number
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
  { id: 3, name: 'Обеденный час', orderCount: 140, foodCount: 18, speed: 17 },
  { id: 4, name: 'Полный зал', orderCount: 220, foodCount: 24, speed: 19 },
  { id: 5, name: 'Вечерняя смена', orderCount: 320, foodCount: 30, speed: 21 },
  { id: 6, name: 'Праздничный стол', orderCount: 450, foodCount: 35, speed: 23 },
  { id: 7, name: 'Большой банкет', orderCount: 600, foodCount: 35, speed: 25 },
]

function buildColumns(phases: ColumnPhases, speed: number): ColumnConfig[] {
  return columns.map(index => ({
    index,
    direction: index % 2 === 0 ? -1 : 1,
    speed,
    initialOffset: phases[index],
  }))
}

function addExtendedOrder(tray: Tray, type: FoodType, orderIndex: number, witness: string[]): void {
  const split = (orderIndex + tray.columnIndex) % 6 === 0
  const counts = split ? [1, 2] : [ITEMS_PER_ORDER]
  for (const count of counts) {
    const depth = tray.layers.length
    const layer: Layer = [null, null, null]
    const firstSlot = (depth + tray.columnIndex) % slots.length
    for (let index = 0; index < count; index += 1) {
      const slot = slots[(firstSlot + index) % slots.length]
      const id = `${tray.id}-${depth}-${slot}`
      layer[slot] = { id, type }
      witness.push(id)
    }
    tray.layers.push(layer)
  }
}

function buildExtendedLevel({ id, name, orderCount, foodCount, speed }: typeof extendedLevels[number]): Level {
  const foodTypes = (Object.keys(foodNames) as FoodType[]).slice(0, foodCount)
  // Eleven is coprime to every extended menu size. Starting near the end
  // brings some of the newly introduced dishes into the first course.
  const menu = foodTypes.map((_, index) => foodTypes[(foodCount - 1 - id % 3 + index * 11) % foodCount])
  const ordersPerDish = Math.floor(orderCount / foodCount)
  const extraOrders = orderCount % foodCount
  const courseSize = 6
  const trays: Tray[] = Array.from({ length: courseSize }, (_, row) => columns.map(columnIndex => ({
    id: `${id}-tray-${row * columns.length + columnIndex + 1}`,
    columnIndex,
    baseY: row * TRAY_PITCH,
    activeLayerIndex: 0,
    layers: [],
  }))).flat()
  const orders: FoodType[] = []
  const witness: string[] = []

  for (let start = 0; start < menu.length; start += courseSize) {
    const course = menu.slice(start, start + courseSize)
    const traysByDish = course.map((): Tray[] => [])
    for (const [index, tray] of trays.entries()) {
      const row = Math.floor(index / columns.length)
      const dishIndex = (row + tray.columnIndex * 2 + start / courseSize) % course.length
      traysByDish[dishIndex].push(tray)
    }

    // Each tray has a single dish per course. A deeper dish can only be
    // blocked by its own copies or by an earlier course already in the queue.
    for (let round = 0; round <= ordersPerDish; round += 1) {
      for (let index = 0; index < course.length; index += 1) {
        const dishIndex = (index + round) % course.length
        const hasExtraOrder = start + dishIndex < extraOrders
        if (round === ordersPerDish && !hasExtraOrder) continue

        const type = course[dishIndex]
        const availableTrays = traysByDish[dishIndex]
        const tray = availableTrays[round % availableTrays.length]
        addExtendedOrder(tray, type, orders.length, witness)
        orders.push(type)
      }
    }
  }

  return {
    id,
    name,
    description: `${foodCount} видов еды и ${orderCount} заказов.`,
    trays,
    columns: buildColumns([10 + id, 31 - id, 6 + id, 26 + id], speed),
    orders,
    witness,
  }
}

function buildLevel(config: LevelLayout): Level {
  const { id, name, description, layout, orders, phases, rowsPerGroup } = config
  const trays: Tray[] = layout.map(({ columnIndex, baseY, slots }, index) => ({
    id: `${id}-tray-${index + 1}`,
    columnIndex,
    baseY,
    activeLayerIndex: 0,
    layers: slots.map((): Layer => [null, null, null]),
  }))
  // Reserve one item from the first queued order for an early trip to storage.
  // The rest of the solution follows the finite order queue.
  const firstQueued = ORDER_SLOTS
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

  return { id, name, description, trays, columns: buildColumns(phases, 15), orders, witness }
}

export const levels = [buildLevel(tutorial), buildLevel(main), ...extendedLevels.map(buildExtendedLevel)]
