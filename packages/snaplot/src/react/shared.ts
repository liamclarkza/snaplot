/**
 * What the React and Solid components share until M13's binding (plan §7.1): splitting props
 * into chart options and host attributes. Everything an option names goes to the chart through
 * setOptions(); the rest goes to the host element.
 */
import { TOP } from '../public/option-keys';
import type { ChartOptions } from '../public/types';

/**
 * Attributes of the host element that a chart component passes through, with any `data-*`
 * attribute (JSX accepts those on components without declaring them).
 */
export interface HostAttributes {
  /** The host element's id. @defaultValue none */
  id?: string;
  /** The host's accessible name. @defaultValue `ariaLabel`, else `'Chart'` */
  'aria-label'?: string;
  /** Ids of elements that describe the chart. @defaultValue none */
  'aria-describedby'?: string;
  /** Ids of elements that name the chart. @defaultValue none */
  'aria-labelledby'?: string;
}

/** Split component props into chart options and host attributes. */
export function splitProps<Row>(props: object): {
  options: ChartOptions<Row>;
  attributes: Record<string, unknown>;
} {
  const options: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (TOP.has(key)) options[key] = value;
    else if (key === 'id' || key.startsWith('aria-') || key.startsWith('data-'))
      attributes[key] = value;
  }
  return { options: options as unknown as ChartOptions<Row>, attributes };
}
