import { describe, expect, it } from 'vitest';
import { ExtensionUpdateInput, MohClassUpdateInput, QueueUpdateInput, TrunkUpdateInput } from '@voip-manager/shared';

// En zod 4, .partial() conserva los .default(): un PATCH parcial reiniciaría el resto de campos.
describe('esquemas de actualización parcial', () => {
  it('no agregan valores por defecto a los campos omitidos', () => {
    expect(ExtensionUpdateInput.parse({ context: 'x' })).toEqual({ context: 'x' });
    expect(TrunkUpdateInput.parse({ host: 'h' })).toEqual({ host: 'h' });
    expect(QueueUpdateInput.parse({ timeout: 9 })).toEqual({ timeout: 9 });
    expect(MohClassUpdateInput.parse({ digit: '2' })).toEqual({ digit: '2' });
  });
  it('siguen validando los campos presentes', () => {
    expect(ExtensionUpdateInput.safeParse({ codecs: ['nope'] }).success).toBe(false);
    expect(MohClassUpdateInput.safeParse({ sort: 'zzz' }).success).toBe(false);
  });
});
