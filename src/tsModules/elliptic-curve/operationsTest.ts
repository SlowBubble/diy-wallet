// @ts-ignore
import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { OpContext, decodeStackElementToBigInt, op_checksig, op_hash160 } from './operations.js';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { BytesObj } from './ooBytes.js';



const tests = [
  {
    testName: 'Test op_checksig',
    testCases: [
      {
        name: 'op_checksig',
        gotFunc: async () => {
          const z = BigInt('0x7c076ff316692a3d7eb3c3bb0f8b1488cf72e1afcd929e29307032997a838a3d');
          const sec = BytesObj.fromHexString(
            '04887387e452b8eacc4acfde10d9aaf7f6d9a0f975aabb10d006e4da568744d06c61de6d95231cd89026e286df3b6ae4a894a3378e393e93a0f45b666329a0ae34'
          ).toBytes();
          const sig = BytesObj.fromHexString(
            '3045022000eff69ef2b1bd93a66ed5219add4fb51e11a840f404876325a1e8ffe0529a2c022100c7207fee197d27c618aea621406f6bf5ef6fca38681d82b2f06fddbdce6feab601'
          ).toBytes();
          const stack = [sig, sec];
          const ctx = new OpContext(stack, [], [], z);
          const output = await op_checksig(ctx);
          return [output, decodeStackElementToBigInt(ctx.stack[0])];
        },
        want: [true, 1n],
      },
    ],
  },
  {
    testName: 'Test op_hash160',
    testCases: [
      {
        name: 'ripemd160',
        // gotFunc: async () => await op_hash160(ctx),
        got: BytesObj.fromUint8Array(ripemd160('The quick brown fox jumps over the lazy dog')).toHexString(),
        want: '37f332f68db77bd9d7edd4969571ad671cf9dd3b',
      },
      {
        name: 'op_hash160',
        gotFunc: async () => {
          const ctx = new OpContext([BytesObj.fromUtf8String('hello world').toBytes()])
          await op_hash160(ctx);
          return BytesObj.fromBytes(ctx.stack[0]).toHexString();
        },
        want: 'd7d5ee7824ff93f94c3055af9382c86c68b5ca92',
      }
    ],
  },
];

tests.forEach(test => {
  runTest(test);
});