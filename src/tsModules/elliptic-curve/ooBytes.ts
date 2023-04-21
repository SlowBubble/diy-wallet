
export type Byte = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 | 78 | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 | 90 | 91 | 92 | 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100 | 101 | 102 | 103 | 104 | 105 | 106 | 107 | 108 | 109 | 110 | 111 | 112 | 113 | 114 | 115 | 116 | 117 | 118 | 119 | 120 | 121 | 122 | 123 | 124 | 125 | 126 | 127 | 128 | 129 | 130 | 131 | 132 | 133 | 134 | 135 | 136 | 137 | 138 | 139 | 140 | 141 | 142 | 143 | 144 | 145 | 146 | 147 | 148 | 149 | 150 | 151 | 152 | 153 | 154 | 155 | 156 | 157 | 158 | 159 | 160 | 161 | 162 | 163 | 164 | 165 | 166 | 167 | 168 | 169 | 170 | 171 | 172 | 173 | 174 | 175 | 176 | 177 | 178 | 179 | 180 | 181 | 182 | 183 | 184 | 185 | 186 | 187 | 188 | 189 | 190 | 191 | 192 | 193 | 194 | 195 | 196 | 197 | 198 | 199 | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 209 | 210 | 211 | 212 | 213 | 214 | 215 | 216 | 217 | 218 | 219 | 220 | 221 | 222 | 223 | 224 | 225 | 226 | 227 | 228 | 229 | 230 | 231 | 232 | 233 | 234 | 235 | 236 | 237 | 238 | 239 | 240 | 241 | 242 | 243 | 244 | 245 | 246 | 247 | 248 | 249 | 250 | 251 | 252 | 253 | 254 | 255;
export type Bytes = Byte[];


export function makeByte(x: number): Byte {
  if (x < 0) {
    throw new Error('byte cannot be negative.');
  }
  if (x > 255) {
    throw new Error('byte cannot be greater than 255.');
  }
  if (Number.isInteger(x) === false) {
    throw new Error('byte must be an integer.');
  }
  return x as Byte;
}

export function makeBytes(x: number[]): Bytes {
  return x.map(makeByte);
}

export function makeBytesObj(bytes: Bytes) {
  return new BytesObj(bytes);
}

export class BytesObj {
  constructor(public bytes: Bytes) {
  }

  static fromBytes(bytes: Bytes) {
    return new BytesObj(bytes);
  }
  toBytes() {
    return this.bytes;
  }

  // Assumes array elements are bytes (e.g. by the context of the code).
  static fromSafeArray(array: number[]) {
    return new BytesObj(makeBytes(array));
  }
  toArray() {
    return this.toBytes();
  }

  static fromHexString(hexString: string) {
    if (hexString.length % 2 !== 0) {
      throw new Error(`Hex string must have even length: ${hexString.length}`);
    }
    const bytes = [];
    for (let i = 0; i < hexString.length; i += 2) {
      const byte = parseInt(hexString.slice(i, i + 2), 16);
      bytes.push(byte);
    }
    return BytesObj.fromSafeArray(bytes);
  }
  toHexString() {
    return this.toBytes().map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static fromUint8Array(array: Uint8Array) {
    return BytesObj.fromSafeArray(Array.from(array));
  }
  toUint8Array() {
    return new Uint8Array(this.toBytes());
  }

  static fromLittleEndianNum(num: bigint, numberOfBytes: number = 0) {
    const bytes = [];
    while (num > 0) {
      bytes.push(Number(num & BigInt(0xff)));
      num = num >> BigInt(8);
    }
    while (bytes.length < numberOfBytes) {
      bytes.push(0);
    }
    return BytesObj.fromSafeArray(bytes);
  }
  toLittleEndianNum() {
    return BigInt('0x' + this.toBytes().map(byte => byte.toString(16).padStart(2, '0')).reverse().join(''));
  }

  static fromBigEndianNum(num: bigint) {
    const bigEndianBytes = BytesObj.fromLittleEndianNum(num);
    return new BytesObj(bigEndianBytes.toBytes().reverse());
  }
  toBigEndianNum() {
    return BigInt('0x' + this.toBytes().map(byte => byte.toString(16).padStart(2, '0')).join(''));
  }

  static fromUtf8String(utf8String: string) {
    const encoder = new TextEncoder();
    return BytesObj.fromSafeArray(Array.from(encoder.encode(utf8String)));
  }
  toUtf8String() {
    const decoder = new TextDecoder();
    return decoder.decode(this.toUint8Array());
  }

  async sha256InUint8Array() {
    const hashBuffer = await crypto.subtle.digest('SHA-256', this.toUint8Array());
    return new Uint8Array(hashBuffer);
  }

  async sha256InBytes() {
    return (await this.sha256()).toBytes();
  }

  async sha256() {
    return BytesObj.fromUint8Array(await this.sha256InUint8Array());
  }
}