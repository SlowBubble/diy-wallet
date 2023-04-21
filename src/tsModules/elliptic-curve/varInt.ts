import { BytesReader } from "./bytesReader";
import { Bytes, BytesObj, makeBytesObj } from "./ooBytes";

export function varIntToBytes(varInt: number): Bytes {
  if (varInt < 0xfd) {
    return BytesObj.fromSafeArray([varInt]).toArray();
  } else if (varInt <= 0xffff) {
    return BytesObj.fromSafeArray([0xfd, varInt & 0xff, (varInt >> 8) & 0xff]).toArray();
  } else if (varInt <= 0xffffffff) {
    return BytesObj.fromSafeArray([
      0xfe,
      varInt & 0xff,
      (varInt >> 8) & 0xff,
      (varInt >> 16) & 0xff,
      (varInt >> 24) & 0xff,
    ]).toArray();
  } else {
    throw new Error('varInt too big');
  }
}

export function varIntFromBytesReaderToBigInt(reader: BytesReader): bigint {
  const firstByte = reader.read(1)[0];
  let numBytesToRead = 0;
  if (firstByte < 0xfd) {
    return BigInt(firstByte);
  } else if (firstByte === 0xfd) {
    numBytesToRead = 2;
  } else if (firstByte === 0xfe) {
    numBytesToRead = 4;
  } else {
    throw new Error('varInt too big');
  }
  return makeBytesObj(reader.read(numBytesToRead)).toLittleEndianNum();
}
