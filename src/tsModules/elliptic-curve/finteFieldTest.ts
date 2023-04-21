// Import point.ts and test plus() and equals() methods
// @ts-ignore
import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';
import { FieldElement } from './finiteField.js';

const tests = [{
  testName: 'finiteField',
  testCases: [
    {
      name: 'plus',
      gotFunc: () => {
        const a = new FieldElement(17n, 31n);
        const b = new FieldElement(21n, 31n);
        return a.plus(b);
      },
      want: new FieldElement(7n, 31n),
    },
    {
      name: 'minus',
      gotFunc: () => {
        const a = new FieldElement(15n, 31n);
        const b = new FieldElement(30n, 31n);
        return a.minus(b);
      },
      want: new FieldElement(16n, 31n),
    },
    {
      name: 'times',
      gotFunc: () => {
        const a = new FieldElement(24n, 31n);
        const b = new FieldElement(19n, 31n);
        return a.times(b);
      },
      want: new FieldElement(22n, 31n),
    },
    {
      name: 'pow',
      gotFunc: () => {
        const a = new FieldElement(17n, 31n);
        return a.toThePower(3n);
      },
      want: new FieldElement(15n, 31n),
    },
    {
      name: 'div',
      gotFunc: () => {
        const a = new FieldElement(3n, 31n);
        const b = new FieldElement(24n, 31n);
        return a.dividedBy(b);
      },
      want: new FieldElement(4n, 31n),
    },
  ],
}];

tests.forEach(test => {
  runTest(test);
});
