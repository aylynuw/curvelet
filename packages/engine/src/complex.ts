export const SIN_Q = [0, 1, 0, -1];
export const COS_Q = [1, 0, -1, 0];

/**
 * If x is a whole multiple of `unit` (π/2 by default, up to rounding of π itself),
 * the quarter-turn index 0..3; otherwise null. Lets sin/cos/exp return exact 0 and ±1.
 */
export function quarterTurnRad(x: number, unit = Math.PI / 2, exact = false): number | null {
  const k = Math.round(x / unit);
  const tolerance = exact ? 0 : 4 * Number.EPSILON * Math.abs(x);
  if (Math.abs(x - k * unit) > tolerance) return null;
  return ((k % 4) + 4) % 4;
}

/** Immutable complex number. Real numbers are complex numbers with im = 0. */
export class Complex {
  constructor(
    readonly re: number,
    readonly im = 0,
  ) {}

  static readonly ZERO = new Complex(0);
  static readonly ONE = new Complex(1);
  static readonly I = new Complex(0, 1);

  static polar(r: number, theta: number): Complex {
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
  }

  isReal(): boolean {
    return this.im === 0;
  }
  isNaN(): boolean {
    return Number.isNaN(this.re) || Number.isNaN(this.im);
  }
  abs(): number {
    return Math.hypot(this.re, this.im);
  }
  arg(): number {
    return Math.atan2(this.im, this.re);
  }
  // `0 - x` instead of `-x`: a real number must keep im = +0, because -0 flips
  // the branch of log/arg (ln(-1) would give -πi instead of πi)
  neg(): Complex {
    return new Complex(0 - this.re, 0 - this.im);
  }
  conj(): Complex {
    return new Complex(this.re, 0 - this.im);
  }
  add(b: Complex): Complex {
    return new Complex(this.re + b.re, this.im + b.im);
  }
  sub(b: Complex): Complex {
    return new Complex(this.re - b.re, this.im - b.im);
  }
  mul(b: Complex): Complex {
    if (this.im === 0 && b.im === 0) return new Complex(this.re * b.re);
    return new Complex(this.re * b.re - this.im * b.im, this.re * b.im + this.im * b.re);
  }
  div(b: Complex): Complex {
    if (this.im === 0 && b.im === 0) return new Complex(this.re / b.re);
    const d = b.re * b.re + b.im * b.im;
    return new Complex((this.re * b.re + this.im * b.im) / d, (this.im * b.re - this.re * b.im) / d);
  }

  /** exact at multiples of π/2 so e^(iπ) = -1, not -1 + 1.2e-16i */
  exp(): Complex {
    const r = Math.exp(this.re);
    if (this.im === 0) return new Complex(r);
    const q = quarterTurnRad(this.im);
    if (q !== null) return new Complex(r * COS_Q[q]!, r * SIN_Q[q]!);
    return Complex.polar(r, this.im);
  }
  /** principal branch */
  log(): Complex {
    if (this.im === 0 && this.re > 0) return new Complex(Math.log(this.re));
    return new Complex(Math.log(this.abs()), this.arg());
  }
  pow(b: Complex): Complex {
    if (this.im === 0 && b.im === 0) {
      const r = Math.pow(this.re, b.re);
      if (!Number.isNaN(r)) return new Complex(r);
      // negative base with a fractional exponent: fall through to the complex result
    }
    if (this.re === 0 && this.im === 0) {
      return b.re > 0 ? Complex.ZERO : new Complex(b.re === 0 && b.im === 0 ? 1 : Infinity);
    }
    // integer powers of complex numbers: repeated multiplication is exact for i^2 etc.
    if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 64) {
      let result: Complex = Complex.ONE;
      for (let k = 0; k < Math.abs(b.re); k++) result = result.mul(this);
      return b.re < 0 ? Complex.ONE.div(result) : result;
    }
    return b.mul(this.log()).exp();
  }
  sqrt(): Complex {
    if (this.im === 0) {
      return this.re >= 0 ? new Complex(Math.sqrt(this.re)) : new Complex(0, Math.sqrt(-this.re));
    }
    const r = this.abs();
    const re = Math.sqrt((r + this.re) / 2);
    const im = Math.sign(this.im) * Math.sqrt((r - this.re) / 2);
    return new Complex(re, im);
  }

  sin(): Complex {
    return new Complex(Math.sin(this.re) * Math.cosh(this.im), Math.cos(this.re) * Math.sinh(this.im));
  }
  cos(): Complex {
    return new Complex(Math.cos(this.re) * Math.cosh(this.im), -Math.sin(this.re) * Math.sinh(this.im));
  }
  tan(): Complex {
    if (this.im === 0) return new Complex(Math.tan(this.re));
    return this.sin().div(this.cos());
  }
  sinh(): Complex {
    return new Complex(Math.sinh(this.re) * Math.cos(this.im), Math.cosh(this.re) * Math.sin(this.im));
  }
  cosh(): Complex {
    return new Complex(Math.cosh(this.re) * Math.cos(this.im), Math.sinh(this.re) * Math.sin(this.im));
  }
  tanh(): Complex {
    if (this.im === 0) return new Complex(Math.tanh(this.re));
    return this.sinh().div(this.cosh());
  }
  /** asin z = -i log(iz + sqrt(1 - z^2)) */
  asin(): Complex {
    if (this.im === 0 && Math.abs(this.re) <= 1) return new Complex(Math.asin(this.re));
    const iz = Complex.I.mul(this);
    return Complex.I.neg().mul(iz.add(Complex.ONE.sub(this.mul(this)).sqrt()).log());
  }
  /** acos z = pi/2 - asin z */
  acos(): Complex {
    if (this.im === 0 && Math.abs(this.re) <= 1) return new Complex(Math.acos(this.re));
    return new Complex(Math.PI / 2).sub(this.asin());
  }
  /** atan z = (i/2) log((i + z)/(i - z)) */
  atan(): Complex {
    if (this.im === 0) return new Complex(Math.atan(this.re));
    return new Complex(0, 0.5).mul(Complex.I.add(this).div(Complex.I.sub(this)).log());
  }
}
