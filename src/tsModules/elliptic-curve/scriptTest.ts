// @ts-ignore
import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { BytesReader } from './bytesReader';
import { BytesObj } from './ooBytes.js';
import { Script } from './script.js';

const serializeWant = '6a47304402207899531a52d59a6de200179928ca900254a36b8dff8bb75f5f5d71b1cdc26125022008b422690b8461cb52c3cc30330b23d574351872b7c361e9aae3649071c1a7160121035d5c93d9ac96881f19ba1f686f15f009ded7c62efe85a872e6a19b43c15a2937';

const tests = [
  {
    testName: 'parsing',
    testCases: [
      {
        name: 'parsing',
        gotFunc: async () => {
          const scriptPubKey = BytesObj.fromHexString('6a47304402207899531a52d59a6de200179928ca900254a36b8dff8bb75f5f5d71b1cdc26125022008b422690b8461cb52c3cc30330b23d574351872b7c361e9aae3649071c1a7160121035d5c93d9ac96881f19ba1f686f15f009ded7c62efe85a872e6a19b43c15a2937')
            .toBytes();
          const script = Script.parse(new BytesReader(scriptPubKey));
          return script.cmds;
        },
        want: [
          '304402207899531a52d59a6de200179928ca900254a36b8dff8bb75f5f5d71b1cdc26125022008b422690b8461cb52c3cc30330b23d574351872b7c361e9aae3649071c1a71601',
          '035d5c93d9ac96881f19ba1f686f15f009ded7c62efe85a872e6a19b43c15a2937',
        ].map(hex => BytesObj.fromHexString(hex).toBytes()),
      },
      {
        name: 'test_serialize',
        gotFunc: async () => {
          const scriptPubKey = BytesObj.fromHexString(serializeWant)
            .toBytes();
          const script = Script.parse(new BytesReader(scriptPubKey));
          return BytesObj.fromBytes(script.serializeToBytes()).toHexString();
        },
        want: serializeWant,
      },
    ],
  },
];

tests.forEach(test => {
  runTest(test);
});