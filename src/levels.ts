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

function buildLevel(config: LevelLayout): Level {
  const { id, name, description, layout, orders, phases, rowsPerGroup } = config
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
    speed: 15,
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

export const levels = [buildLevel(tutorial), buildLevel(main)]
