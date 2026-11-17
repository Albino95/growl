import { describe, expect, it } from 'vitest';
import { twExtend } from './tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../tailwind.config.js');

describe('tokens ↔ tailwind.config.js', () => {
  it('stay in sync', () => {
    const ext = config.theme.extend;
    expect(ext.spacing).toEqual(twExtend.spacing);
    expect(ext.borderRadius).toEqual(twExtend.borderRadius);
    expect(ext.fontSize).toEqual(twExtend.fontSize);
  });
});
