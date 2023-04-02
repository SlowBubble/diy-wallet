
export type Bytes = number[];

export function bytesToLittleEndianBigInt(bytes: Bytes): bigint {
  return BigInt('0x' + bytes.map(byte => byte.toString(16).padStart(2, '0')).reverse().join(''));
}

export function bytesToBigEndianBigInt(bytes: Bytes): bigint {
  return BigInt('0x' + bytes.map(byte => byte.toString(16).padStart(2, '0')).join(''));
}

export function bigIntToLittleEndianBytes(bigInt: bigint, numberOfBytes: number): Bytes {
  const bytes: Bytes = [];
  while (bigInt > 0) {
    bytes.push(Number(bigInt & BigInt(0xff)));
    bigInt = bigInt >> BigInt(8);
  }
  while (bytes.length < numberOfBytes) {
    bytes.push(0);
  }
  return bytes;
}

export function intToLittleEndianBytes(int: number, numberOfBytes: number): Bytes {
  return bigIntToLittleEndianBytes(BigInt(int), numberOfBytes);
}

export function hexStringToBytes(hexString: string): Bytes {
  const bytes: Bytes = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.slice(i, i + 2), 16));
  }
  return bytes;
}

export function bytesToHexString(bytes: Bytes) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function bytesToSha256(bytes: Bytes): Promise<Bytes> {
  const msgUint8 = new Uint8Array(bytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer));
}
