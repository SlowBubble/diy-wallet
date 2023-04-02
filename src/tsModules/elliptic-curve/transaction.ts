import { bigIntToLittleEndianBytes, Bytes, bytesToHexString, bytesToLittleEndianBigInt, bytesToSha256, intToLittleEndianBytes } from "./bytes";
import { BytesReader } from "./bytesReader";
import { Script } from "./script";
import { varIntFrombytesReaderToBigInt, varIntToBytes } from "./varInt";

export class Transaction {
  constructor(public version: number, public inputs: Input[], public outputs: Output[], public locktime: number, public testnet: boolean = false) {
  }
  static parse(reader: BytesReader, testnet: boolean = false) {
    const version = Number(bytesToLittleEndianBigInt(reader.read(4)));
    const numInputs = varIntFrombytesReaderToBigInt(reader);
    const inputs = [];
    for (let i = 0; i < numInputs; i++) {
      inputs.push(Input.parse(reader));
    }
    const numOutputs = varIntFrombytesReaderToBigInt(reader);
    const outputs = [];
    for (let i = 0; i < numOutputs; i++) {
      outputs.push(Output.parse(reader));
    }
    const locktime = Number(bytesToLittleEndianBigInt(reader.read(4)));
    return new Transaction(version, inputs, outputs, locktime, testnet);
  }
  serialize() {
    const results = [
      intToLittleEndianBytes(this.version, 4),
      varIntToBytes(this.inputs.length),
    ];
    for (const input of this.inputs) {
      results.push(input.serialize());
    }
    results.push(varIntToBytes(this.outputs.length));
    for (const output of this.outputs) {
      results.push(output.serialize());
    }
    results.push(intToLittleEndianBytes(this.locktime, 4));
    return results.flat();
  }
  async hash(): Promise<Bytes> {
    const sha256 = await bytesToSha256(this.serialize());
    return sha256.reverse();
  }
  async id(): Promise<string> {
    const hash = await this.hash();
    return bytesToHexString(hash);
  }
}

export class Input {
  constructor(public prevTx: Bytes, public prevTxIndex: number, public scriptSig: Script, public sequence: number = 0xffffffff) {
  }
  static parse(reader: BytesReader) {
    const prevTx = reader.read(32).reverse();
    const prevTxIndex = Number(bytesToLittleEndianBigInt(reader.read(4)));
    const scriptSig = Script.parse(reader);
    const sequence = Number(bytesToLittleEndianBigInt(reader.read(4)));
    return new Input(prevTx, prevTxIndex, scriptSig, sequence);
  }
  serialize(): Bytes {
    const results = [
      this.prevTx,
      intToLittleEndianBytes(this.prevTxIndex, 4),
      this.scriptSig.serialize(),
      intToLittleEndianBytes(this.sequence, 4),
    ];
    return results.flat();
  }
}

export class Output {
  constructor(public amount: bigint, public scriptPubKey: Script) {
  }
  static parse(reader: BytesReader) {
    const amount = bytesToLittleEndianBigInt(reader.read(8));
    const scriptPubKey = Script.parse(reader);
    return new Output(amount, scriptPubKey);
  }
  serialize() {
    const results = [
      bigIntToLittleEndianBytes(this.amount, 8),
      this.scriptPubKey.serialize(),
    ];
    return results.flat();
  }
}