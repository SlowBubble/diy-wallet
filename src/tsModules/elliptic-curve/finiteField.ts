import { modExp, mod } from "./math";

export class FieldElement {
  constructor(public num: bigint, public prime: bigint) {
    if (num >= prime || num < 0n) {
      throw new Error('Num must be in range 0 to prime');
    }
  }
  equals(other: FieldElement) {
    return this.num === other.num && this.prime === other.prime;
  }
  plus(other: FieldElement) {
    if (this.prime !== other.prime) {
      throw new Error('Cannot add two numbers in different Fields');
    }
    const num = mod(this.num + other.num, this.prime);
    return new FieldElement(num, this.prime);
  }
  minus(other: FieldElement) {
    if (this.prime !== other.prime) {
      throw new Error('Cannot subtract two numbers in different Fields');
    }
    const num = mod(this.num - other.num, this.prime);
    return new FieldElement(num, this.prime);
  }
  times(other: FieldElement) {
    if (this.prime !== other.prime) {
      throw new Error('Cannot multiply two numbers in different Fields');
    }
    const num = mod(this.num * other.num, this.prime)
    return new FieldElement(num, this.prime);
  }
  scalarMultiply(scalar: bigint) {
    const num = mod(this.num * scalar, this.prime);
    return new FieldElement(num, this.prime);
  }
  toThePower(exponent: bigint) {
    const n = mod(exponent, this.prime - 1n);
    const num = modExp(this.num, n, this.prime);
    return new FieldElement(num, this.prime);
  }
  dividedBy(other: FieldElement) {
    if (this.prime !== other.prime) {
      throw new Error('Cannot divide two numbers in different Fields');
    }
    // this.num and other.num are the actual values
    // this.prime is what we need to mod against
    // use fermat's little theorem:
    // this.num**(p-1) % p == 1
    // this means:
    // 1/n == pow(n, p-2, p)
    const num = mod(this.num * modExp(other.num, this.prime - 2n, this.prime), this.prime);
    return new FieldElement(num, this.prime);
  }

  isZero() {
    return this.num === 0n;
  }
}

