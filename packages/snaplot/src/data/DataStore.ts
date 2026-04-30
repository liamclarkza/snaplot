import type { ColumnarData } from '../types';

export interface ColumnarSegment {
  logicalStart: number;
  logicalEnd: number;
  physicalStart: number;
  physicalEnd: number;
}

export interface DataStore {
  readonly x: Float64Array;
  readonly length: number;
  readonly seriesCount: number;

  y(seriesIdx: number): Float64Array;
  getColumn(index: number): Float64Array;
  getPhysicalColumn(index: number): Float64Array;
  getData(): ColumnarData;

  setData(data: ColumnarData): void;
  append(data: ColumnarData): boolean;

  xAt(index: number): number;
  yAt(seriesIdx: number, index: number): number;
  valueAt(columnIdx: number, index: number): number;

  lowerBoundX(value: number): number;
  upperBoundX(value: number): number;
  nearestXIndex(value: number): number;
  getViewportIndices(xMin: number, xMax: number): [number, number];
  getSegments(startIdx: number, endIdx: number): ColumnarSegment[];
  yRange(seriesIndices: number[], startIdx: number, endIdx: number): [number, number];
}

export function validateMaxLen(maxLen: number): void {
  if (!Number.isInteger(maxLen) || maxLen < 0) {
    throw new Error(`streaming.maxLen must be a non-negative integer, received ${maxLen}.`);
  }
}
