// // Import point.ts and test plus() and equals() methods
// import { NonzeroPoint, ZeroPoint } from './point';
// import { runTest } from '../../../node_modules/@clubfest/table-test/index.js';

// const tests = [{
//   testName: 'equals',
//   testCases: [
//     {
//       name: 'equals for same points',
//       gotFunc: () => {
//         const p1 = new NonzeroPoint(-2, 0, 0, 8);
//         const p2 = new NonzeroPoint(-2, 0, 0, 8);
//         return p1.equals(p2);
//       },
//       want: true,
//     },
//     {
//       name: 'equals for same finite points',
//       gotFunc: () => {
//         const p1 = new NonzeroPoint(-2, 0, 0, 8);
//         const p2 = new NonzeroPoint(1, 3, 0, 8);
//         return p1.equals(p2);
//       },
//       want: false,
//     },
//     {
//       name: 'equals for 1 finite point and 1 zero point',
//       gotFunc: () => {
//         const p1 = new NonzeroPoint(-2, 0, 0, 8);
//         const p2 = new ZeroPoint(0, 8);
//         return p1.equals(p2);
//       },
//       want: false,
//     },
//     {
//       name: 'equals for 2 zero points',
//       gotFunc: () => {
//         const p1 = new ZeroPoint(3, 4);
//         const p2 = new ZeroPoint(3, 4);
//         return p1.equals(p2);
//       },
//       want: true,
//     },
//   ]
// }];

// tests.forEach(test => {
//   runTest(test);
// });
