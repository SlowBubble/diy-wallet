import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { parseHexStringInDerToSignature, Signature } from './signature';

const tests = [
  {
    testName: 'Signature DER serialization',
    testCases: [
      {
        name: 'r = 1, s = 2',
        got: parseHexStringInDerToSignature(new Signature(1n, 2n).getDerHexString()),
        want: new Signature(1n, 2n),
      },
      {
        name: 'big',
        got: (new Signature(
          BigInt('0x37206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c6'),
          BigInt('0x8ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec'),
        )).getDerHexString(),
        want: '3045022037206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c60221008ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec',
      },
      {
        name: 'big',
        got: (new Signature(
          BigInt('0x37206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c6'),
          BigInt('0x8ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec'),
        )).der(),
        want: '3045022037206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c60221008ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec',
      },
    ],
  },
];

tests.forEach(test => {
  runTest(test);
});
