import { hmacSha256 } from "./bits";
import { mod, modExp } from "./math";
import { ZeroPoint } from "./point";
import { PublicKey } from "./publicKey";
import { generator, generatorOrder } from "./secp256";
import { Signature } from "./signature";

export class PrivateKey {
  publicKey: PublicKey;
  constructor(public secret: bigint) {
    if (secret >= generatorOrder || secret < 0n) {
      throw new Error(`Secret is out of range: ${secret}`);
    }
    const point = generator.scalarMultiply(this.secret);
    if (point instanceof ZeroPoint) {
      throw new Error('Point is zero');
    }
    this.publicKey = new PublicKey(point);
  }

  async sign(z: bigint) {
    const k = await deterministicK(z, this.secret);
    const kG = generator.scalarMultiply(k);
    if (kG instanceof ZeroPoint) {
      throw new Error(`kG is zero. k: ${k}, z: ${z}`);
    }
    const r = kG.x.num;
    const kInv = modExp(k, generatorOrder - 2n, generatorOrder);
    let s = mod(kInv * (z + r * this.secret), generatorOrder);
    if (s > generatorOrder / 2n) {
      s = generatorOrder - s; 
    }
    return new Signature(r, s);
  }
}

export async function deterministicK(z: bigint, secret: bigint): Promise<bigint> {
  // RFC 6979
  let k = new Uint8Array(32);
  let v = new Uint8Array(32);
  v.fill(1);
  if (z > generatorOrder) {
    z -= generatorOrder;
  }
  const zBytes = z.toString(16).padStart(64, '0');
  const secretBytes = secret.toString(16).padStart(64, '0');
  const messageHexString = uint8ArrayToHexString(v) + '00' + secretBytes + zBytes;
  k = await hmacSha256(k, hexToUint8Array(messageHexString));
  v = await hmacSha256(k, v);
  k = await hmacSha256(k, hexToUint8Array(uint8ArrayToHexString(v) + '01' + secretBytes + zBytes));
  v = await hmacSha256(k, v);
  while (true) {
    v = await hmacSha256(k, v);
    const candidate = BigInt('0x' + uint8ArrayToHexString(v));
    if (candidate >= 1 && candidate < generatorOrder) {
      return candidate;
    }
    k = await hmacSha256(k, hexToUint8Array(uint8ArrayToHexString(v) + '00'));
    v = await hmacSha256(k, v);
  }
}

// Convert a hex string to a byte array
function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex string must have even length: ${hex}`);
  }
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

function uint8ArrayToHexString(array: Uint8Array): string {
  return Array.from(array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
