import { FieldElement } from "./finiteField";
import { NonzeroPoint } from "./point";

export const prime = 2n ** 256n - 2n ** 32n - 2n ** 9n - 2n ** 8n - 2n ** 7n - 2n ** 6n - 2n ** 4n - 1n;
export const a = new FieldElement(0n, prime);
export const b = new FieldElement(7n, prime);
export const generatorOrder = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
export const generator = makeGenerator();

export function makeSecp256Point(x: bigint, y: bigint): NonzeroPoint {
  return new NonzeroPoint(new FieldElement(x, prime), new FieldElement(y, prime), a, b);
}

export function makeSecp256PointFromHex(x: string, y: string): NonzeroPoint {
  return makeSecp256Point(BigInt("0x" + x), BigInt("0x" + y));
}

function makeGenerator(): NonzeroPoint {
  const xNum = 55066263022277343669578718895168534326250603453777594175500187360389116729240n;
  const yNum = 32670510020758816978083085130507043184471273380659243275938904335757337482424n;
  return makeSecp256Point(xNum, yNum);
}

export function serializeInCompressedSecFormat(point: NonzeroPoint): string {
  const x = point.x.num.toString(16).padStart(64, "0");
  if (point.y.num % 2n === 0n) {
    return "02" + x;
  }
  return "03" + x;
}

export function serializeInUncompressedSecFormat(point: NonzeroPoint): string {
  const x = point.x.num.toString(16).padStart(64, "0");
  const y = point.y.num.toString(16).padStart(64, "0");
  return "04" + x + y;
}

export function deserializeFromSecFormat(hex: string): NonzeroPoint {
  const marker = hex.slice(0, 2);
  if (marker === "04") {
    return makeSecp256PointFromHex(hex.slice(2, 66), hex.slice(66, 130));
  }
  if (marker !== "02" && marker !== "03") {
    throw new Error(`Invalid marker: ${marker}; hex: ${hex}`);
  }
  const isEven = marker === "02";
  const x = new FieldElement(BigInt("0x" + hex.slice(2, 66)), prime);
  const alpha = x.toThePower(3n).plus(b);
  // beta is the square root of alpha using Fermat's little theorem.
  const beta = alpha.toThePower((prime + 1n) / 4n);
  let even_beta = beta.num % 2n === 0n ? beta : new FieldElement(prime - beta.num, prime);
  let odd_beta = beta.num % 2n === 0n ? new FieldElement(prime - beta.num, prime) : beta;
  return isEven ? makeSecp256Point(x.num, even_beta.num) : makeSecp256Point(x.num, odd_beta.num);
}
