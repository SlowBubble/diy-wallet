// @ts-ignore
import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { NonzeroPoint } from './point';
import { generatorOrder, generator, serializeInCompressedSecFormat, serializeInUncompressedSecFormat, deserializeFromSecFormat } from './secp256';

const tests = [
  {
    testName: 'Validate secp256 parameters',
    testCases: [
      {
        name: 'generatorOrder is a valid upper bound of the order of the generator',
        got: generator.scalarMultiply(generatorOrder).isZero(),
        want: true,
      },
    ],
  },
  {
    testName: 'sec serialization',
    testCases: [
      {
        name: 'compressed sec serialization',
        got: serializeInCompressedSecFormat(generator.scalarMultiply(123n) as NonzeroPoint),
        want: '03a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5'
      },
      {
        name: 'uncompressed sec serialization',
        got: serializeInUncompressedSecFormat(generator.scalarMultiply(123n) as NonzeroPoint),
        want: '04a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5204b5d6f84822c307e4b4a7140737aec23fc63b65b35f86a10026dbd2d864e6b'
      }
    ],
  },
  {
    testName: 'serialize and deserialize',
    testCases: [
      {
        name: 'compressed',
        got: deserializeFromSecFormat(serializeInCompressedSecFormat(generator.scalarMultiply(123n) as NonzeroPoint)),
        want: generator.scalarMultiply(123n) as NonzeroPoint,
      },
      {
        name: 'uncompressed',
        got: deserializeFromSecFormat(serializeInUncompressedSecFormat(generator.scalarMultiply(1234n) as NonzeroPoint)),
        want: generator.scalarMultiply(1234n) as NonzeroPoint,
      },
    ],
  }
];

tests.forEach(test => {
  runTest(test);
});
