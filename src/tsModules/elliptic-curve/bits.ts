
export type Bit = 0 | 1;

export function genRandomBits(numBits: number): Bit[] {
  // Use crypto.getRandomValues to generate an array of numBits Bit
  const randomBytes = new Uint8Array(Math.ceil(numBits/8));
  crypto.getRandomValues(randomBytes);
  return uint8arrayToBits(randomBytes).slice(0, numBits);
}

export function genRandomInt(upperBoundNoninclusive: bigint): bigint {
  const randomBits = genRandomBits(upperBoundNoninclusive.toString(2).length);
  const candidate = BigInt(`0b${randomBits.join('')}`);
  if (candidate < upperBoundNoninclusive) {
    return candidate;
  }
  return genRandomInt(upperBoundNoninclusive);
}

export function utf8StringToBigInt(str: string): bigint {
  const bytes = new TextEncoder().encode(str);
  return bytesToBigInt(bytes);
}

export function bigIntToHexString(num: bigint): string {
  return num.toString(16).toUpperCase();
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let idx = 0; idx < bytes.length; idx++) {
    result = result * 256n + BigInt(bytes[idx]);
  }
  return result;
}

export async function hmacSha256(secret: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  // Encode as UTF-8, i.e. each character is 1 uint8 element in the Uint8Array.
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    algorithm,
    false, ["sign", "verify"]
  );
  const hashBuffer = await crypto.subtle.sign(
    algorithm.name, 
    key, 
    message,
  );
  return new Uint8Array(hashBuffer);
}

export async function sha256(message:string): Promise<Uint8Array> {
    // encode as UTF-8
    const msgBuffer = new TextEncoder().encode(message);                    

    // hash the message
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

    return new Uint8Array(hashBuffer);
    // const hashArray = Array.from(new Uint8Array(hashBuffer));
    // const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function uint8arrayToBits(array: Uint8Array): Bit[] {
  const result: Bit[] = [];
  for (let idx = 0; idx < array.length; idx++) {
    const byte = array[idx];
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const bit = (byte >> bitIdx) & 1;
      result.push(bit as Bit);
    }
  }
  return result;
}



