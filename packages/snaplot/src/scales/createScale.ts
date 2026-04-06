import type { Scale, ScaleType } from '../types';
import { LinearScale } from './LinearScale';
import { LogScale } from './LogScale';
import { TimeScale } from './TimeScale';

/**
 * Factory: create a Scale instance by type.
 */
export function createScale(
  type: ScaleType,
  key: string,
  min?: number,
  max?: number,
): Scale {
  switch (type) {
    case 'linear':
      return new LinearScale(key, min, max);
    case 'log':
      return new LogScale(key, min, max);
    case 'time':
      return new TimeScale(key, min, max);
    default:
      return new LinearScale(key, min, max);
  }
}
