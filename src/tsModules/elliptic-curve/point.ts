import { FieldElement } from "./finiteField";

export type Point = ZeroPoint | NonzeroPoint;

export class ZeroPoint {
  constructor(public a: FieldElement, public b: FieldElement) {
  }
  equals(other: Point) {
    return other instanceof ZeroPoint && this.a === other.a && this.b === other.b;
  }
  plus(other: Point) {
    return other;
  }
  scalarMultiply(_scalar: bigint) {
    return this;
  }
  inverse() {
    return this;
  }
  clone() {
    return new ZeroPoint(this.a, this.b);
  }
  isZero() {
    return true;
  }
}

export class NonzeroPoint {
  constructor(public x: FieldElement, public y: FieldElement, public a: FieldElement, public b: FieldElement) {
    if (!x.times(x).times(x).plus(a.times(x)).plus(b).minus(y.times(y)).isZero()) {
      throw new Error(`Invalid point. x: ${x.num}, y: ${y.num}, x^3 + ax + b: ${x.times(x).times(x).plus(a.times(x)).plus(b).num}, y^2: ${y.times(y).num}`);
    }
  }

  clone() {
    return new NonzeroPoint(this.x, this.y, this.a, this.b);
  }
  isZero() {
    return false;
  }

  equals(other: Point) {
    if (other instanceof ZeroPoint) {
      return false;
    }
    return this.x.equals(other.x) && this.y.equals(other.y) && this.a.equals(other.a) && this.b.equals(other.b);
  }

  plus(other: Point): Point {
    if (!this.a.equals(other.a) || !this.b.equals(other.b)) {
      throw new Error('Points must be on the same curve');
    }
    // Adding the point to the zero point
    if (other instanceof ZeroPoint) {
      return this;
    }

    // Adding the same point
    if (this.equals(other)) {
      // if y == 0, return zero
      if (this.y.num === 0n) {
        return new ZeroPoint(this.a, this.b);
      }
      const s = this.x.toThePower(2n).scalarMultiply(3n).plus(this.a).dividedBy(this.y.scalarMultiply(2n));
      const x = s.toThePower(2n).minus(this.x.scalarMultiply(2n));
      const y = s.times(this.x.minus(x)).minus(this.y);
      return new NonzeroPoint(x, y, this.a, this.b);
    }

    // Adding the inverse point
    if (this.x.equals(other.x) && !this.y.equals(other.y)) {
      return new ZeroPoint(this.a, this.b);
    }

    // Adding two different points
    const s = other.y.minus(this.y).dividedBy(other.x.minus(this.x));
    const x = s.toThePower(2n).minus(this.x).minus(other.x);
    const y = s.times(this.x.minus(x)).minus(this.y);
    return new NonzeroPoint(x, y, this.a, this.b);
  }

  inverse() {
    return new NonzeroPoint(this.x, this.y.scalarMultiply(-1n), this.a, this.b);
  }

  scalarMultiply(multiplier: bigint): Point {
    // Handle negative scalar
    if (multiplier < 0) {
      return this.inverse().scalarMultiply(-multiplier);
    }

    let result = new ZeroPoint(this.a, this.b);
    let current: Point = this.clone();
    let currentMultiplier = multiplier;
    while (currentMultiplier) {
      if (currentMultiplier & 1n) {
        result = result.plus(current);
      }
      current = current.plus(current);
      currentMultiplier = currentMultiplier >> 1n;
    }
    return result;

  }
}