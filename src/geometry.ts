import { activeLayer, LOGICAL_WIDTH, trayY, type FoodItem, type Game, type Tray } from './game.ts';

export const TRAY_WIDTH = 94;
export const TRAY_HEIGHT = 73;
export const PREVIEW_Y = 75;
export const PREVIEW_WIDTH = 82;
export const PREVIEW_HEIGHT = 30;
const LANE_WIDTH = LOGICAL_WIDTH / 4;
const TRAY_GUTTER = (LANE_WIDTH - TRAY_WIDTH) / 2;
// Give each food slot its share of the full lane, including the tray rim.
const SLOT_WIDTH = LANE_WIDTH / 3;

export type Point = { x: number; y: number };
export type TapGesture = Point & { itemId: string };

export type ProjectedTray = Point & { tray: Tray };
export type ProjectedSlot = Point & {
  item: FoodItem;
  trayId: string;
  slot: number;
  width: number;
  height: number;
};

export function trayX(column: number): number {
  return LANE_WIDTH * column + TRAY_GUTTER;
}

export function slotCenter(slot: number): number {
  return SLOT_WIDTH * (slot + .5) - TRAY_GUTTER;
}

export function visibleTrays(game: Game, fieldHeight: number): ProjectedTray[] {
  const result: ProjectedTray[] = [];
  for (const tray of game.trays) {
    const y = trayY(game, tray);
    if (y + PREVIEW_Y + PREVIEW_HEIGHT > 0 && y < fieldHeight) {
      result.push({ tray, x: trayX(tray.columnIndex), y });
    }
  }
  return result;
}

export function projectTrays(game: Game, fieldHeight: number): ProjectedSlot[] {
  const slots: ProjectedSlot[] = [];
  for (const { tray, x, y } of visibleTrays(game, fieldHeight)) {
    activeLayer(tray)?.forEach((item, slot) => {
      if (item && y + TRAY_HEIGHT > 0) {
        slots.push({
          item,
          trayId: tray.id,
          slot,
          x: x - TRAY_GUTTER + SLOT_WIDTH * slot,
          y,
          width: SLOT_WIDTH,
          height: TRAY_HEIGHT,
        });
      }
    });
  }
  return slots;
}

export function hitTest(slots: ProjectedSlot[], point: Point, fieldHeight: number): ProjectedSlot | null {
  if (point.x < 0 || point.x >= LOGICAL_WIDTH || point.y < 0 || point.y >= fieldHeight) return null;
  return slots.find(slot =>
    point.x >= slot.x && point.x < slot.x + slot.width &&
    point.y >= slot.y && point.y < slot.y + slot.height
  ) ?? null;
}

export function matchesTap(
  gesture: TapGesture,
  screenPoint: Point,
  logicalPoint: Point,
  slots: ProjectedSlot[],
  fieldHeight: number,
): boolean {
  return Math.hypot(screenPoint.x - gesture.x, screenPoint.y - gesture.y) <= 8 &&
    hitTest(slots, logicalPoint, fieldHeight)?.item.id === gesture.itemId;
}
