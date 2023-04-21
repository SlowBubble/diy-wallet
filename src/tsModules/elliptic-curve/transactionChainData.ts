
import { BytesObj } from "./ooBytes";
import { PrivateKey } from "./privateKey";
import { Script } from "./script";
import { serializeInCompressedSecFormat } from "./secp256";
import { Transaction, Input } from "./transaction";
import { varIntToBytes } from "./varInt";

const SIGNHASH_ALL = 1;
const SIGNHASH_NONE = 2;
const SIGNHASH_SINGLE = 3;

// TODO find a valid tx id to test this.
function getUrl(testnet=false) {
  // return testnet ? "https://testnet.blockchain.info/rawtx/" : "https://blockchain.info/rawtx/";
  // return testnet ? "https://testnet.blockexplorer.com/api/tx/" : "https://blockexplorer.com/api/tx/";
  return testnet ?  "http://testnet.programmingbitcoin.com" : "http://mainnet.programmingbitcoin.com";
  // return testnet ? 'https://api.blockcypher.com/v1/btc/test3/txs/' : 'https://api.blockcypher.com/v1/btc/main/txs/';
}

export class TransactionFetcher {
  // cache is currently just used for testing.
  constructor(public cache: Map<string, Transaction> = new Map()) {
  }
  static fromStringMap(map: Map<string, string>): TransactionFetcher {
    const cache = new Map();
    for (const [id, hexString] of map) {
      const transaction = Transaction.parseHexString(hexString);
      cache.set(id, transaction);
    }
    return new TransactionFetcher(cache);
  }
  async fetchTransaction(id: string, testnet: boolean = false): Promise<Transaction> {
    const possTx = this.cache.get(id);
    if (possTx) {
      return possTx;
    }
    const url = `${getUrl(testnet)}/tx/${id}.hex`;
    const response = await fetch(url);
    const hexString = await response.text();
    const transaction = Transaction.parseHexString(hexString, testnet);
    const txId = await transaction.id();
    if (txId !== id) {
      throw new Error(`requested transaction id: ${id}, received id: ${txId}`);
    }
    return transaction;
  }
  async getInputValue(input: Input, testnet: boolean = false): Promise<bigint> {
    const tx = await this.fetchTransaction(BytesObj.fromBytes(input.prevTx).toHexString(), testnet);
    return tx.outputs[input.prevTxIndex].amount;
  }
  async getInputScriptPubKey(input: Input, testnet: boolean = false): Promise<Script> {
    const tx = await this.fetchTransaction(BytesObj.fromBytes(input.prevTx).toHexString(), testnet);
    return tx.outputs[input.prevTxIndex].scriptPubKey;
  }
  async getTransactionFee(transaction: Transaction): Promise<bigint> {
    let inputSum = 0n;
    let outputSum = 0n;
    for (const input of transaction.inputs) {
      inputSum += await this.getInputValue(input, transaction.testnet);
    }
    for (const output of transaction.outputs) {
      outputSum += output.amount;
    }
    return inputSum - outputSum;
  }
  // Returns the integer representation of the hash that needs to get signed.
  async getTransactionSigHash(transaction: Transaction, inputIndex: number): Promise<bigint> {
    const serial = BytesObj.fromLittleEndianNum(BigInt(transaction.version), 4).toBytes();
    serial.push(...varIntToBytes(transaction.inputs.length));
    // loop through each input using enumerate, so we have the input index
    for (const [i, input] of transaction.inputs.entries()) {
      let scriptSig = new Script();
      if (i === inputIndex) {
        // the previous tx's ScriptPubkey is the ScriptSig
        scriptSig = await this.getInputScriptPubKey(input, transaction.testnet);
      }
      const txIn = new Input(input.prevTx, input.prevTxIndex, scriptSig, input.sequence);
      serial.push(...txIn.serializeToBytes());
    }
    // Outputs
    serial.push(...varIntToBytes(transaction.outputs.length));
    for (const output of transaction.outputs) {
      serial.push(...output.serializeToBytes());
    }
    // Locktime
    serial.push(...BytesObj.fromLittleEndianNum(BigInt(transaction.locktime), 4).toBytes());
    // SIGHASH_ALL; TODO see if we need to refactor this out as a constant.
    serial.push(...BytesObj.fromLittleEndianNum(BigInt(SIGNHASH_ALL), 4).toBytes());
    // hash256 the serialization
    const hashInByteObj = await (await BytesObj.fromBytes(serial).sha256()).sha256();
    return hashInByteObj.toBigEndianNum();
  }
  // Returns whether the input has a valid signature
  async verifyInput(transaction: Transaction, inputIndex: number) {
    const input = transaction.inputs[inputIndex];
    const scriptPubKey = await this.getInputScriptPubKey(input, transaction.testnet);
    const z = await this.getTransactionSigHash(transaction, inputIndex);
    const combined = input.scriptSig.add(scriptPubKey);
    return combined.evaluate(z);
  }
  // Returns whether all inputs have valid signatures
  async verifyTransaction(transaction: Transaction) {
    if ((await this.getTransactionFee(transaction)) < 0n) {
      return false;
    }
    for (let i = 0; i < transaction.inputs.length; i++) {
      if (!await this.verifyInput(transaction, i)) {
        return false;
      }
    }
    return true;
  }
  // Modify the transaction in place to sign the input at inputIndex with privateKey
  async signInput(transaction: Transaction, inputIndex: number, privateKey: PrivateKey) {
    const input = transaction.inputs[inputIndex];
    const z = await this.getTransactionSigHash(transaction, inputIndex);
    const der = (await privateKey.sign(z)).getDerBytes();
    const sig = der.concat(BytesObj.fromBigEndianNum(BigInt(SIGNHASH_ALL)).toBytes());
    const compressedSec = BytesObj.fromHexString(serializeInCompressedSecFormat(privateKey.publicKey.point)).toBytes();
    const scriptSig = new Script([sig, compressedSec]);
    // change input's script_sig to new script
    input.scriptSig = scriptSig;
    return this.verifyTransaction(transaction);
  }
}
