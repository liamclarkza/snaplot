import { describe, expect, it } from 'vitest';
import { isDarkColor, parseColor, withAlpha } from './color';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#1a2b3c')).toEqual([26, 43, 60]);
    expect(parseColor('#FFFFFF')).toEqual([255, 255, 255]);
  });

  it('parses 3-digit hex by doubling digits', () => {
    expect(parseColor('#000')).toEqual([0, 0, 0]);
    expect(parseColor('#abc')).toEqual([170, 187, 204]);
  });

  it('parses 8-digit and 4-digit hex, ignoring alpha', () => {
    expect(parseColor('#11223380')).toEqual([17, 34, 51]);
    expect(parseColor('#1238')).toEqual([17, 34, 51]);
  });

  it('parses rgb() and rgba() in comma and space syntax', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual([10, 20, 30]);
    expect(parseColor('rgb(10 20 30 / 0.5)')).toEqual([10, 20, 30]);
  });

  it('parses common named colors', () => {
    expect(parseColor('black')).toEqual([0, 0, 0]);
    expect(parseColor('White')).toEqual([255, 255, 255]);
  });

  it('returns null for unsupported formats', () => {
    expect(parseColor('hsl(230 20% 8%)')).toBeNull();
    expect(parseColor('oklch(0.2 0.02 260)')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('not-a-color')).toBeNull();
  });
});

describe('isDarkColor', () => {
  it('classifies shorthand dark hex as dark', () => {
    expect(isDarkColor('#000', false)).toBe(true);
    expect(isDarkColor('#111', false)).toBe(true);
  });

  it('classifies named white as light even with a dark fallback', () => {
    expect(isDarkColor('white', true)).toBe(false);
  });

  it('uses the fallback for unparseable colors', () => {
    expect(isDarkColor('hsl(0 0% 0%)', true)).toBe(true);
    expect(isDarkColor('hsl(0 0% 0%)', false)).toBe(false);
  });
});

describe('withAlpha', () => {
  it('applies alpha to hex colors', () => {
    expect(withAlpha('#ff0000', 0.3)).toBe('rgba(255,0,0,0.3)');
    expect(withAlpha('#f00', 0.3)).toBe('rgba(255,0,0,0.3)');
  });

  it('returns unparseable input unchanged instead of rgba(NaN,...)', () => {
    expect(withAlpha('salmon-ish', 0.5)).toBe('salmon-ish');
  });
});
