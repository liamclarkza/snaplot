/**
 * The GestureManager's state machine: the pointers down, the area a pointer is over, and the
 * gesture in progress (a press, a cursor drag, a pan, a box, a pinch).
 */

export interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  pointerType: string;
}

export interface AreaResult {
  type: 'plot' | 'axis' | 'outside';
  axisKey?: string;
}

export type GestureState =
  | { kind: 'idle' }
  | ActivePressState
  | ActiveCursorState
  | ActivePanState
  | ActiveBoxState
  | ActivePinchState;

export interface ActivePressState {
  kind: 'press' | 'selection-pending' | 'long-press-ready';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  lastMoveTime: number;
  area: AreaResult;
}

export interface ActiveCursorState {
  kind: 'cursor';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

export interface ActivePanState {
  kind: 'pan';
  pointerId: number;
  pointerType: string;
  lastX: number;
  lastY: number;
  axis?: string;
  lastMoveTime: number;
  velocityX: number;
  velocityY: number;
}

export interface ActiveBoxState {
  kind: 'box';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  mode: 'zoom' | 'selection';
}

export interface ActivePinchState {
  kind: 'pinch';
  lastDist: number;
}
