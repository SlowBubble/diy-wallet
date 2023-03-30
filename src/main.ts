import { bip39WordList } from "./bip39WordList";

main();

const numBitsInPrivateKey = 256;
const numBitsInHex = 4;
const numBitsInBip39WordList = 11;
type Bit = 0 | 1;

function main() {
  const resultDiv = document.getElementById('mnemonics-result');
  const bitsDiv = document.getElementById('bits-result');
  const hexDiv = document.getElementById('hex-result');
  document.getElementById('mnemonics-gen')!.onclick = async _ => {
    const randomBits = genRandomBits(numBitsInPrivateKey);
    const zeroPadding: Bit[] = [];
    for (let idx = 0; idx < numBitsInBip39WordList - (randomBits.length % numBitsInBip39WordList); idx++) {
      zeroPadding.push(0);
    }
    const words = genWords(randomBits.concat(zeroPadding));
    resultDiv!.innerHTML = `Mnemonics: ${words.join('\n')}`;
    bitsDiv!.innerHTML = `Private key (Binary): ${randomBits.join('')}`;
    hexDiv!.innerHTML = `Private key (Hex): ${bitsToHexStr(randomBits)}`;
  };
}


// bits must have length divisible by 11 because bip39WordList is 2^11 in size.
function genWords(bits: Bit[]) {
  if (bits.length % numBitsInBip39WordList !== 0) {
    throw `Input must have length divisible by ${numBitsInBip39WordList}. Input length: ${bits.length}`;
  }
  const result = [];
  for (let idx = 0; idx < bits.length; idx += numBitsInBip39WordList) {
    const chunkOfBits = bits.slice(idx, idx + numBitsInBip39WordList);
    const bitsInString = chunkOfBits.join('');
    const numRepresentation = parseInt(bitsInString, 2);
    result.push(bip39WordList[numRepresentation]);
  }
  return result;
}

function genRandomBits(numBits: number): Bit[] {
  const result: Bit[] = [];
  for (let idx = 0; idx < numBits; idx++) {
    const randomBit = Math.floor(2 * Math.random()) as Bit;
    result.push(randomBit);
  }
  return result;
}

function bitsToHexStr(bits: Bit[]) {
  if (bits.length % numBitsInHex !== 0) {
    throw `Input must have length divisible by ${numBitsInHex}. Input length: ${bits.length}`;
  }
  const hexArray = [];
  for (let idx = 0; idx < bits.length; idx += numBitsInHex) {
    const chunkOfBits = bits.slice(idx, idx + numBitsInHex);
    const bitsInString = chunkOfBits.join('');
    hexArray.push(parseInt(bitsInString, 2).toString(16).toUpperCase());
  }
  return hexArray.join('');
}

// async function hash(string: string) {
//   const utf8 = new TextEncoder().encode(string);
//   const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
//   const hashArray = Array.from(new Uint8Array(hashBuffer));
//   const hashHex = hashArray
//     .map((bytes) => bytes.toString(16).padStart(2, '0'))
//     .join('');
//   return hashHex;
// }
