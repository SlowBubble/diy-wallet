import { modExp } from "./math";
import { NonzeroPoint } from "./point";
import { generator, generatorOrder } from "./secp256";
import { Signature } from "./signature";

export class PublicKey {
  constructor(public point: NonzeroPoint) {
  }
  verify(z: bigint, signature: Signature) {
    const sInv = modExp(signature.s, generatorOrder - 2n, generatorOrder);
    const u = z * sInv % generatorOrder;
    const v = signature.r * sInv % generatorOrder;
    const total = generator.scalarMultiply(u).plus(this.point.scalarMultiply(v));
    if (total instanceof NonzeroPoint) {
      return total.x.num === signature.r;
    }
    return false;
  }
}