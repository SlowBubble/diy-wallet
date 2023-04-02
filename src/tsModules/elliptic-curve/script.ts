import { Bytes } from "./bytes";
import { BytesReader } from "./bytesReader";
import { varIntFrombytesReaderToBigInt } from "./varInt";

export class Script {
  constructor(public cmds: string[]) {

  }
  static parse(reader: BytesReader) {
    const length = varIntFrombytesReaderToBigInt(reader);
    const cmds = [];

    return new Script(cmds);
  }
  evaluate(z) {

  }
  serialize(): Bytes {
  }
}