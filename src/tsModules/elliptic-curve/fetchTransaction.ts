import { bytesToBigEndianBigInt, hexStringToBytes } from "./bytes";
import { BytesReader } from "./bytesReader";
import { Transaction } from "./transaction";

function getUrl(testnet=false) {
  // return testnet ? "https://testnet.blockchain.info/rawtx/" : "https://blockchain.info/rawtx/";
  // return testnet ? "https://testnet.blockexplorer.com/api/tx/" : "https://blockexplorer.com/api/tx/";
  return testnet ?  "http://testnet.programmingbitcoin.com" : "http://mainnet.programmingbitcoin.com";
  // return testnet ? 'https://api.blockcypher.com/v1/btc/test3/txs/' : 'https://api.blockcypher.com/v1/btc/main/txs/';
}

export async function fetchTransaction(id: string, testnet=false): Promise<Transaction> {
  const url = `${getUrl(testnet)}/tx/${id}.hex`;
  const response = await fetch(url);
  const hexString = await response.text();
  const bytes = hexStringToBytes(hexString.trim());
  let transaction;
  if (bytes[4] === 0) {
    const splicedBytes = bytes.slice(0, 4).concat(bytes.slice(6));
    transaction = Transaction.parse(new BytesReader(splicedBytes), testnet);
    transaction.locktime = Number(bytesToBigEndianBigInt(splicedBytes.slice(splicedBytes.length - 4)));
  } else {
    transaction = Transaction.parse(new BytesReader(bytes), testnet);
  }
  const txId = await transaction.id();
  if (txId !== id) {
    throw new Error(`requested transaction id: ${id}, received id: ${txId}`);
  }
  return transaction;
}