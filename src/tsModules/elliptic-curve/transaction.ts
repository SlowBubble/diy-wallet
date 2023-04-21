import { BytesReader } from "./bytesReader";
import { Bytes, BytesObj } from "./ooBytes";
import { Script } from "./script";
import { varIntFromBytesReaderToBigInt, varIntToBytes } from "./varInt";

export class Transaction {
  constructor(public version: number, public inputs: Input[], public outputs: Output[], public locktime: number, public testnet: boolean = false) {
  }
  static parse(reader: BytesReader, testnet: boolean = false) {
    const version = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
    const numInputs = varIntFromBytesReaderToBigInt(reader);
    const inputs = [];
    for (let i = 0; i < numInputs; i++) {
      inputs.push(Input.parse(reader));
    }
    const numOutputs = varIntFromBytesReaderToBigInt(reader);
    const outputs = [];
    for (let i = 0; i < numOutputs; i++) {
      outputs.push(Output.parse(reader));
    }
    const locktime = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
    return new Transaction(version, inputs, outputs, locktime, testnet);
  }

  static parseHexString(hex: string, testnet: boolean = false) {
    const bytes = BytesObj.fromHexString(hex).toBytes();
    if (bytes[4] !== 0) {
      return Transaction.parse(new BytesReader(bytes), testnet);
    }
    const splicedBytes = bytes.slice(0, 4).concat(bytes.slice(6));
    const transaction = Transaction.parse(new BytesReader(splicedBytes), testnet);
    transaction.locktime = Number(BytesObj.fromBytes(splicedBytes.slice(splicedBytes.length - 4)).toBigEndianNum());
    return transaction;
  }

  serializeToBytes(): Bytes {
    const results = [
      BytesObj.fromLittleEndianNum(BigInt(this.version), 4).toBytes(),
      varIntToBytes(this.inputs.length),
    ];
    for (const input of this.inputs) {
      results.push(input.serializeToBytes());
    }
    results.push(varIntToBytes(this.outputs.length));
    for (const output of this.outputs) {
      results.push(output.serializeToBytes());
    }
    results.push(BytesObj.fromLittleEndianNum(BigInt(this.locktime), 4).toBytes());
    return results.flat();
  }
  async hash(): Promise<Bytes> {
    const sha256 = await BytesObj.fromBytes(this.serializeToBytes()).sha256InBytes();
    return sha256.reverse();
  }
  async id(): Promise<string> {
    const hash = await this.hash();
    return BytesObj.fromBytes(hash).toHexString();
  }
}

export class Input {
  constructor(public prevTx: Bytes, public prevTxIndex: number, public scriptSig: Script = new Script(), public sequence: number = 0xffffffff) {
  }
  static parse(reader: BytesReader) {
    const prevTx = reader.read(32).reverse();
    const prevTxIndex = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
    const scriptSig = Script.parse(reader);
    const sequence = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
    return new Input(prevTx, prevTxIndex, scriptSig, sequence);
  }
  serializeToBytes(): Bytes {
    const results = [
      // Clone prevTx because reverse() mutates the array.
      this.prevTx.slice().reverse(),
      BytesObj.fromLittleEndianNum(BigInt(this.prevTxIndex), 4).toBytes(),
      this.scriptSig.serializeToBytes(),
      BytesObj.fromLittleEndianNum(BigInt(this.sequence), 4).toBytes(),
    ];
    return results.flat();
  }
}

export class Output {
  constructor(public amount: bigint, public scriptPubKey: Script) {
  }
  static parse(reader: BytesReader) {
    const amount = BytesObj.fromBytes(reader.read(8)).toLittleEndianNum();
    const scriptPubKey = Script.parse(reader);
    return new Output(amount, scriptPubKey);
  }
  serializeToBytes() {
    const results = [
      BytesObj.fromLittleEndianNum(this.amount, 8).toBytes(),
      this.scriptPubKey.serializeToBytes(),
    ];
    return results.flat();
  }
}