import { NEUTRAL_PARAMS, createRecipe, resolveParams } from '../params';
import {
  DENOISE_SKSL,
  MAIN_SKSL,
  denoiseUniforms,
  mainUniforms,
  packUniforms,
  tintVector,
  whiteBalanceGains,
  type UniformIntrospection,
} from '../shaders';

/** Parses `uniform floatN name;` declarations (in order) from SkSL source. */
function declaredUniforms(source: string): { name: string; size: number }[] {
  return [...source.matchAll(/uniform\s+float(\d)?\s+(\w+)\s*;/g)].map((match) => ({
    name: match[2] as string,
    size: match[1] ? Number(match[1]) : 1,
  }));
}

function fakeEffect(source: string): UniformIntrospection {
  const uniforms = declaredUniforms(source);
  const slots: number[] = [];
  uniforms.reduce((offset, u) => {
    slots.push(offset);
    return offset + u.size;
  }, 0);
  return {
    getUniformCount: () => uniforms.length,
    getUniformName: (i) => uniforms[i]!.name,
    getUniform: (i) => ({ columns: uniforms[i]!.size, rows: 1, slot: slots[i]! }),
    getUniformFloatCount: () => uniforms.reduce((sum, u) => sum + u.size, 0),
  };
}

describe('uniform contracts', () => {
  it('main shader uniforms match exactly what mainUniforms provides', () => {
    const provided = mainUniforms(resolveParams(createRecipe('cinematic')), {
      tileOrigin: [0, 0],
      imageSize: [100, 80],
      baseScale: [0.1, 0.1],
    });
    const declared = declaredUniforms(MAIN_SKSL);
    expect(Object.keys(provided).sort()).toEqual(declared.map((u) => u.name).sort());
    for (const u of declared) expect(provided[u.name]).toHaveLength(u.size);
  });

  it('denoise shader uniforms match denoiseUniforms', () => {
    const provided = denoiseUniforms(NEUTRAL_PARAMS, 4000);
    expect(Object.keys(provided).sort()).toEqual(declaredUniforms(DENOISE_SKSL).map((u) => u.name).sort());
  });

  it('packs values at the slots reported by the effect', () => {
    const effect = fakeEffect('uniform float a; uniform float3 b; uniform float2 c;');
    expect(packUniforms(effect, { a: [1], b: [2, 3, 4], c: [5, 6] })).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => packUniforms(effect, { a: [1], b: [2, 3], c: [5, 6] })).toThrow(/expects 3/);
    expect(() => packUniforms(effect, { a: [1], c: [5, 6] })).toThrow(/Missing uniform "b"/);
  });
});

describe('white balance gains', () => {
  it('is identity at zero and preserves luminance otherwise', () => {
    expect(whiteBalanceGains(0, 0).map((v) => Number(v.toFixed(6)))).toEqual([1, 1, 1]);
    for (const [t, n] of [
      [40, 0],
      [-60, 20],
      [10, -35],
    ] as const) {
      const [r, g, b] = whiteBalanceGains(t, n);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 6);
    }
  });

  it('warms with positive temperature and adds magenta with positive tint', () => {
    const [r, , b] = whiteBalanceGains(50, 0);
    expect(r).toBeGreaterThan(b);
    const [r2, g2, b2] = whiteBalanceGains(0, 50);
    expect(g2).toBeLessThan(r2);
    expect(g2).toBeLessThan(b2);
  });
});

describe('split toning', () => {
  it('produces luminance-neutral tint vectors scaled by amount', () => {
    const v = tintVector(30, 100);
    expect(0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]).toBeCloseTo(0, 6);
    for (const component of tintVector(30, 0)) expect(component).toBeCloseTo(0, 10);
  });
});
