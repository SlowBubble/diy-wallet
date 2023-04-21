// @ts-ignore
import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { bigIntToHexString, utf8StringToBigInt } from './bits';
import { FieldElement } from './finiteField';
import { NonzeroPoint } from './point';
import { deterministicK, PrivateKey } from './privateKey';
import { PublicKey } from './publicKey';
import { a, b, prime } from './secp256';
import { Signature } from './signature';

const tests = [
  {
    testName: 'Validate deterministic k',
    testCases: [
      {
        name: 'z = 1, secret = 2',
        gotFunc: async () => await deterministicK(1n, 2n),
        want: 55011535551607205752885120107633045649828315282044383851804932465098807755297n,
      },
      {
        name: 'bigger numbers',
        gotFunc: async () => await deterministicK(123456n, 234567n),
        want: 46225099573337112997705306672724988527241421704518114973178018050856218537201n,
      },
    ],
  },
  {
    testName: 'Validate private key signing',
    testCases: [
      {
        name: 'Sign and verify with z = 1, secret = 2',
        gotFunc: async () => {
          const message = 1n;
          const privateKey = new PrivateKey(2n);
          const signature = await privateKey.sign(message);
          return privateKey.publicKey.verify(message, signature);
        },
        want: true,
      },
      {
        name: 'test Verify',
        gotFunc: async () => {
          const point = new NonzeroPoint(
            new FieldElement(BigInt('0x887387e452b8eacc4acfde10d9aaf7f6d9a0f975aabb10d006e4da568744d06c'), prime),
            new FieldElement(BigInt('0x61de6d95231cd89026e286df3b6ae4a894a3378e393e93a0f45b666329a0ae34'), prime),
            a, b);
          const z = BigInt('0xec208baa0fc1c19f708a9ca96fdeff3ac3f230bb4a7ba4aede4942ad003c0f60');
          const r = BigInt('0xac8d1c87e51d0d441be8b3dd5b05c8795b48875dffe00b7ffcfac23010d3a395');
          const s = BigInt('0x68342ceff8935ededd102dd876ffd6ba72d6a427a3edb13d26eb0781cb423c4');
          const publicKey = new PublicKey(point);
          return publicKey.verify(z, new Signature(r, s));
        },
        want: true,
      },
      // // Use external data to test sign: https://crypto.stackexchange.com/a/54222
      // {
      //   name: 'secret = 1, message = Absence makes the heart grow fonder.',
      //   gotFunc: async () => {
      //     const message = utf8StringToBigInt('Absence makes the heart grow fonder.');
      //     const privateKey = new PrivateKey(1n);
      //     const signature = await privateKey.sign(message);
      //     return bigIntToHexString(signature.r);
      //   },
      //   want: true,
      // },
    ],
  }
];

tests.forEach(test => {
  runTest(test);
});