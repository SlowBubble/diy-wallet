import { Bytes, bytesToLittleEndianBigInt } from "./bytes";
import { BytesReader } from "./bytesReader";

export function varIntToBytes(varInt: number): Bytes {
  if (varInt < 0xfd) {
    return [varInt];
  } else if (varInt <= 0xffff) {
    return [0xfd, varInt & 0xff, (varInt >> 8) & 0xff];
  } else if (varInt <= 0xffffffff) {
    return [0xfe, varInt & 0xff, (varInt >> 8) & 0xff, (varInt >> 16) & 0xff, (varInt >> 24) & 0xff];
  } else {
    throw new Error('varInt too big');
  }
}

export function varIntFrombytesReaderToBigInt(reader: BytesReader): bigint {
  const firstByte = reader.read(1)[0];
  if (firstByte < 0xfd) {
    return BigInt(firstByte);
  } else if (firstByte === 0xfd) {
    return bytesToLittleEndianBigInt(reader.read(2));
  } else if (firstByte === 0xfe) {
    return bytesToLittleEndianBigInt(reader.read(4));
  } else {
    throw new Error('varInt too big');
  }
}

