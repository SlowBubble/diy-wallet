import { ripemd160 } from "@noble/hashes/ripemd160";
import { Byte, Bytes, BytesObj, makeByte, makeBytesObj } from "./ooBytes";
import { PublicKey } from "./publicKey";
import { deserializeFromSecFormat } from "./secp256";
import { parseHexStringInDerToSignature } from "./signature";

export type Data = Bytes;
export type OpCode = Byte;
export type Command = Data | OpCode;
export type Stack = Bytes[];
type OpFunc = (ctx: OpContext) => Promise<boolean>;

export function isData(cmd: Command): cmd is Data {
  return typeof cmd !== 'number';
}

export function isOpCode(cmd: Command): cmd is OpCode {
  return typeof cmd === 'number';
}

export class OpContext {
  constructor(public stack: Stack = [], public altStack: Stack = [], public cmds: Command[] = [], public z: bigint = 0n) {}
}

// Rules for encoding/decoding between bigint and stack element:
// - 0 is an empty byte array
// - encode the positive part as a little endian byte array
// - handle the last bit of last byte specially so that it is 0 for positive numbers and 1 for negative numbers
//   - just modify the existing last bit of last byte if it was 0
//   - add a new byte if the last bit of last byte was 1
export function encodeBigIntToStackElement(num: bigint): Bytes {
  if (num === 0n) {
    return [];
  }

  const negative = num < 0;
  const absNum = negative ? -num : num;
  const bytesForAbsNum = BytesObj.fromLittleEndianNum(absNum).toBytes();
  const lastByteForAbsNum = bytesForAbsNum[bytesForAbsNum.length - 1];
  const lastBitOfLastByteIsOneForAbsNum = lastByteForAbsNum & 0x80;
  if (negative && (lastBitOfLastByteIsOneForAbsNum)) {
    return bytesForAbsNum.concat(0x80);
  }
  if (negative) {
    const lastByte: Byte = makeByte(lastByteForAbsNum | 0x80);
    return bytesForAbsNum.slice(0, bytesForAbsNum.length - 1).concat(lastByte);
  }
  if (lastBitOfLastByteIsOneForAbsNum) {
    return bytesForAbsNum.concat(0);
  }
  return bytesForAbsNum;
}

export function decodeStackElementToBigInt(stackElement: Bytes): bigint {
  if (stackElement.length === 0) {
    return BigInt(0);
  }
  const lastByte = stackElement[stackElement.length - 1];
  const lastBitOfLastByteIsOne = lastByte & 0x80;
  if (lastBitOfLastByteIsOne) {
    return -makeBytesObj(stackElement.slice(0, stackElement.length - 1)).toLittleEndianNum();
  }
  return makeBytesObj(stackElement).toLittleEndianNum();
}

function genOpNumFunc(num: number): OpFunc {
  return async ctx => {
    ctx.stack.push(encodeBigIntToStackElement(BigInt(num)));
    return true;
  };
}

export function opCodeToFunc(opCode: number): OpFunc {
  const OP_CODE_FUNCTIONS: {
    [key: number]: OpFunc;
  } = {
    0: genOpNumFunc(0),
    79: genOpNumFunc(-1),
    81: genOpNumFunc(1),
    82: genOpNumFunc(2),
    83: genOpNumFunc(3),
    84: genOpNumFunc(4),
    85: genOpNumFunc(5),
    86: genOpNumFunc(6),
    87: genOpNumFunc(7),
    88: genOpNumFunc(8),
    89: genOpNumFunc(9),
    90: genOpNumFunc(10),
    91: genOpNumFunc(11),
    92: genOpNumFunc(12),
    93: genOpNumFunc(13),
    94: genOpNumFunc(14),
    95: genOpNumFunc(15),
    96: genOpNumFunc(16),
    97: op_nop,
    99: op_if,
    100: op_notif,
    105: op_verify,
    106: op_return,
    // 107: op_toaltstack,
    // 108: op_fromaltstack,
    // 109: op_2drop,
    // 110: op_2dup,
    // 111: op_3dup,
    // 112: op_2over,
    // 113: op_2rot,
    // 114: op_2swap,
    // 115: op_ifdup,
    // 116: op_depth,
    // 117: op_drop,
    118: op_dup,
    // 119: op_nip,
    // 120: op_over,
    // 121: op_pick,
    // 122: op_roll,
    // 123: op_rot,
    // 124: op_swap,
    // 125: op_tuck,
    // 130: op_size,
    135: op_equal,
    136: op_equalverify,
    // 139: op_1add,
    // 140: op_1sub,
    // 143: op_negate,
    // 144: op_abs,
    // 145: op_not,
    // 146: op_0notequal,
    // 147: op_add,
    // 148: op_sub,
    // 154: op_booland,
    // 155: op_boolor,
    // 156: op_numequal,
    // 157: op_numequalverify,
    // 158: op_numnotequal,
    // 159: op_lessthan,
    // 160: op_greaterthan,
    // 161: op_lessthanorequal,
    // 162: op_greaterthanorequal,
    // 163: op_min,
    // 164: op_max,
    // 165: op_within,
    // 166: op_ripemd160,
    // 167: op_sha1,
    // 168: op_sha256,
    169: op_hash160,
    170: op_hash256,
    172: op_checksig,
    // 173: op_checksigverify,
    // 174: op_checkmultisig,
    // 175: op_checkmultisigverify,
    // 176: op_nop,
    // 177: op_checklocktimeverify,
    // 178: op_checksequenceverify,
    179: op_nop,
    180: op_nop,
    181: op_nop,
    182: op_nop,
    183: op_nop,
    184: op_nop,
    185: op_nop,
  };
  const func = OP_CODE_FUNCTIONS[opCode];
  if (func) {
    return func;
  }
  throw new Error(`Unknown op code: ${opCode}`);
}

// Implement all the opcode functions in this order starting with op_nop
export async function op_nop(ctx: OpContext): Promise<boolean> {
  return true;
}

export async function op_if(ctx: OpContext): Promise<boolean> {
  throw new Error("Not implemented");
}

export async function op_notif(ctx: OpContext): Promise<boolean> {
  throw new Error("Not implemented");
}

export async function op_verify(ctx: OpContext): Promise<boolean> {
  if (ctx.stack.length < 1) {
    return false;
  }
  const value = ctx.stack.pop()!;
  if (decodeStackElementToBigInt(value) === 0n) {
    return false;
  }
  return true;
}

export async function op_return(ctx: OpContext): Promise<boolean> {
  return false;
}

export async function op_dup(ctx: OpContext): Promise<boolean> {
  if (ctx.stack.length < 1) {
    return false;
  }
  ctx.stack.push(ctx.stack[ctx.stack.length - 1]);
  return true;
}

export async function op_hash160(ctx: OpContext): Promise<boolean> {
  if (ctx.stack.length < 1) {
    return false;
  }
  const sha256 = await makeBytesObj(ctx.stack.pop()!).sha256InUint8Array();
  const ripemd160InUint8Array = ripemd160(sha256);
  ctx.stack.push(BytesObj.fromUint8Array(ripemd160InUint8Array).toBytes());
  return true;
}

export async function op_hash256(ctx: OpContext): Promise<boolean> {
  if (ctx.stack.length < 1) {
    return false;
  }
  const sha256 = await makeBytesObj(ctx.stack.pop()!).sha256InBytes();
  ctx.stack.push(sha256);
  return true;
}

export async function op_equal(ctx: OpContext): Promise<boolean> {
  if (ctx.stack.length < 2) {
    return false;
  }
  const a = ctx.stack.pop()!;
  const b = ctx.stack.pop()!;
  ctx.stack.push(JSON.stringify(a) === JSON.stringify(b) ? encodeBigIntToStackElement(1n) : encodeBigIntToStackElement(0n));
  return true;
}

export async function op_equalverify(ctx: OpContext): Promise<boolean> {
  return (await op_equal(ctx)) && (await op_verify(ctx));
}

export async function op_checksig(ctx: OpContext): Promise<boolean> {
  if (ctx.stack.length < 2) {
    return false;
  }
  const publicKeyBytes = ctx.stack.pop()!;
  // Remove the trailing 0x01, which is the sighash type.
  const sigBytes = ctx.stack.pop()!.slice(0, -1);
  let point;
  try {
    point = deserializeFromSecFormat(makeBytesObj(publicKeyBytes).toHexString());
  } catch (e) {
    console.log('Failed to deserialize public key: ', publicKeyBytes, e);
    return false;
  }
  let sig;
  try {
    sig = parseHexStringInDerToSignature(makeBytesObj(sigBytes).toHexString());
  } catch (e) {
    console.log('Failed to deserialize signature: ', sigBytes, e);
    return false;
  }
  const pubKey = new PublicKey(point);
  if (pubKey.verify(ctx.z, sig)) {
    ctx.stack.push(encodeBigIntToStackElement(1n));
  } else {
    ctx.stack.push(encodeBigIntToStackElement(0n));
  }
  return true;
}
