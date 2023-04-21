import { Bytes, BytesObj, makeByte, makeBytes } from "./ooBytes";

export function parseHexStringInDerToSignature(hexString: string) {
  const firstByte = hexString.slice(0, 2);
  if (firstByte !== '30') {
    throw new Error('Invalid DER signature');
  }
  const length = parseInt(hexString.slice(2, 4), 16);
  if (length * 2 + 4 !== hexString.length) {
    throw new Error('Invalid DER signature');
  }
  const rMarker = hexString.slice(4, 6);
  if (rMarker !== '02') {
    throw new Error('Invalid marker for r in DER signature');
  }
  const rLength = parseInt(hexString.slice(6, 8), 16);
  const r = BigInt('0x' + hexString.slice(8, 8 + rLength * 2));
  const sMarker = hexString.slice(8 + rLength * 2, 10 + rLength * 2);
  if (sMarker !== '02') {
    throw new Error('Invalid marker for s in DER signature');
  }
  const sLength = parseInt(hexString.slice(10 + rLength * 2, 12 + rLength * 2), 16);
  const s = BigInt('0x' + hexString.slice(12 + rLength * 2, 12 + rLength * 2 + sLength * 2));
  return new Signature(r, s);
}


export class Signature {
  constructor(public r: bigint, public s: bigint) {
  }
  getDerBytes(): Bytes {
    const metadata: Bytes = [];
    // 1. Start with the 0x30 byte.
    metadata.push(0x30);

    const rData = encodeSigComponent(this.r);
    const sData = encodeSigComponent(this.s);
    const data = rData.concat(sData);

    // 2. Encode the length of the rest of the signature (usually 0x44 or 0x45) and append.
    metadata.push(makeByte(data.length));

    return metadata.concat(data);
  }
  getDerHexString() {
    return bytesToHexString(this.getDerBytes());
  }  
}

function bytesToHexString(bytes: Bytes) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}


function encodeSigComponent(bigInt: bigint): Bytes {
  const data: Bytes = [];
  // 3. Append the marker byte, 0x02.
  data.push(0x02);

  // 4. Encode r as a big-endian integer, removing all null bytes at the beginning.
  let bigIntInBytes = BytesObj.fromBigEndianNum(bigInt).toBytes();
  // if bigInt has a high bit, add a \x00
  if (bigIntInBytes[0] >= 0x80) {
    bigIntInBytes = makeBytes([0x00].concat(bigIntInBytes));
  }

  data.push(makeByte(bigIntInBytes.length));
  data.push(...bigIntInBytes);
  return data;
}
