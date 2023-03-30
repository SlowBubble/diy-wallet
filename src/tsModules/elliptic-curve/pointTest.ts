// Import point.ts and test plus() and equals() methods
import { NonzeroPoint, ZeroPoint } from './point';
import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { FieldElement } from './finiteField';

const prime = 223n;
const a = new FieldElement(0n, prime);
const b = new FieldElement(7n, prime);
const x1 = new FieldElement(192n, prime);
const y1 = new FieldElement(105n, prime);
const x2 = new FieldElement(17n, prime);
const y2 = new FieldElement(56n, prime);
const xSum = new FieldElement(170n, prime);
const ySum = new FieldElement(142n, prime);
const p1 = new NonzeroPoint(x1, y1, a, b);
const p2 = new NonzeroPoint(x2, y2, a, b);
const sum = new NonzeroPoint(xSum, ySum, a, b);
const zero = new ZeroPoint(a, b);

const prime2 = 5n;
const a2 = new FieldElement(0n, prime2);
const b2 = new FieldElement(0n, prime2);
const x3 = new FieldElement(1n, prime2);
const y3 = new FieldElement(1n, prime2);
const p3 = new NonzeroPoint(x3, y3, a2, b2);
const p4 = new NonzeroPoint(new FieldElement(4n, prime2), new FieldElement(2n, prime2), a2, b2);

const tests = [
  {
    testName: 'plus',
    testCases: [
      {
        name: 'doubling a finite point',
        got: p3.plus(p3),
        want: p4,
      },
      {
        name: 'add 1 finite point and 1 zero point',
        got: p1.plus(zero),
        want: p1,
      },
      {
        name: 'adding 2 points with big prime',
        got: p1.plus(p2),
        want: sum,
      },
    ],
  },
  {
    testName: 'scalarMultiply',
    testCases: [
      {
        name: 'scalar multiply for 1 zero point',
        got: zero.scalarMultiply(2n),
        want: zero,
      },
      {
        name: 'scalar multiply 2 is same as adding 2 times',
        got: p1.scalarMultiply(2n),
        want: p1.plus(p1),
      },
      {
        name: 'scalar multiply -4 is same as inverse of adding 4 times',
        got: p1.scalarMultiply(-4n),
        want: p1.plus(p1).plus(p1).plus(p1).inverse(),
      },
    ],
  }
];

tests.forEach(test => {
  runTest(test);
});
