import { Bytes } from "./ooBytes";

export class BytesReader {
  constructor(public bytes: Bytes, public offset: number = 0) {
  }
  read(length: number): Bytes {
    const bytes = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }
  isFinished(): boolean {
    return this.offset >= this.bytes.length;
  }
}

export function toRemainingBytes(reader: BytesReader) {
  return reader.read(reader.bytes.length - reader.offset);
}