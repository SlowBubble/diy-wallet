(function () {
  'use strict';

  // https://stackoverflow.com/a/22165114/2191332
  function getCallerInfo() {
    const result = {};
    try {
      //Throw an error to generate a stack trace
      throw new Error();
    } catch(e) {
      //Split the stack trace into each line
      var stackLines = e.stack.split('\n');
      var callerIndex = 0;
      //Now walk though each line until we find a path reference
      for(var i in stackLines){
        if(!stackLines[i].match(/:\/\//)) continue;
        //We skipped all the lines with out an http so we now have a script reference
        //This one is the class constructor, the next is the getScriptPath() call
        //The one after that is the user code requesting the path info (so offset by 2)
        callerIndex = Number(i) + 2;
        break;
      }
      //Now parse the string for each section we want to return
      if (stackLines.length > callerIndex) {
        const relevantLine = stackLines[callerIndex];
        const httpUrl = relevantLine.match(/(http[s]?:\/\/.+\/[^\/]+\.js):/);
        if (httpUrl && httpUrl.length > 1) {
          result.url = httpUrl[1];
        }
        const fileName = relevantLine.match(/\/([^\/]+\.js):/);
        if (fileName && fileName.length > 1) {
          result.fileName = fileName[1];
        }
        const filePath = relevantLine.match(/file:\/\/(\/.+\.js):/);
        if (filePath && filePath.length > 1) {
          result.filePath = filePath[1];
        }
      }
    }
    return result;
  }

  // https://stackoverflow.com/a/16788517/2191332
  function objectEquals(x, y) {

    if (x === null || x === undefined || y === null || y === undefined) { return x === y; }
    // not checking object constructor.

    // if they are functions, they should exactly refer to same one (because of closures)
    if (x instanceof Function) { return x === y; }
    // if they are regexps, they should exactly refer to same one (it is hard to better equality check on current ES)
    if (x instanceof RegExp) { return x === y; }
    if (x === y || x.valueOf() === y.valueOf()) { return true; }
    if (Array.isArray(x) && x.length !== y.length) { return false; }

    // if they are dates, they must had equal valueOf
    if (x instanceof Date) { return false; }

    // if they are strictly equal, they both need to be object at least
    if (!(x instanceof Object)) { return false; }
    if (!(y instanceof Object)) { return false; }

    // recursive object equality check
    var p = Object.keys(x);
    return Object.keys(y).every(function (i) { return p.indexOf(i) !== -1; }) &&
        p.every(function (i) { return objectEquals(x[i], y[i]); });
  }

  async function runTestCases(testCases, setupFunc) {
    const results = [];
    // Using a for loop instead of map, so we can block the loop when calling a asynchronous gotFunc.
    for (const tc of testCases) {
      const result = {
        name: tc.name,
        want: tc.wantErrSubstring ? `want error substring: ${tc.wantErrSubstring}` : tc.want,
        got: tc.got,
        errString: null,
        stackTrace: null,
      };
      const tcContext = {
        args: tc.args,
        setup: {}
      };
      if (setupFunc) {
        try {
          const setupResult = await setupFunc(tcContext);
          tcContext.setup = {...tcContext.setup, ...setupResult};
        } catch (err) {
          result.isSuccessful = false;
          result.got = `common setup error: ${err.toString()}`;
          result.errString = err.toString();
          result.stackTrace = err.stack;
          results.push(result);
          continue;
        }
      }
      if (tc.setupFunc) {
        try {
          const setupResult = await tc.setupFunc(tcContext);
          tcContext.setup = {...tcContext.setup, ...setupResult};
        } catch (err) {
          result.isSuccessful = false;
          result.got = `setup error: ${err.toString()}`;
          result.errString = err.toString();
          result.stackTrace = err.stack;
          results.push(result);
          continue;
        }
      }
      if (tc.gotFunc) {
        try {
          result.got = await tc.gotFunc(tcContext);
          if (tc.wantErrSubstring) {
            result.isSuccessful = false;
            results.push(result);
            continue;
          }
        } catch (err) {
          result.got = `got error: ${err.toString()}`;
          result.errString = err.toString();
          result.isSuccessful = result.got.includes(tc.wantErrSubstring);
          if (!result.isSuccessful) {
            result.stackTrace = err.stack;
          }
          results.push(result);
          continue;
        }
      }

      const comparisonFunc = tc.comparisonFunc || objectEquals;
      result.isSuccessful = comparisonFunc(result.got, result.want);
      results.push(result);
      continue;
    }

    return results
  }

  // This works for both browser and non-browser, but browser logic is added if report.testScriptUrl is present.
  function renderTestReport(report, renderFunc) {
    const htmlId = report.numFailures ? 'failing' : 'passing';

    let testNameReplace = report.testName;
    if (report.testScriptUrl) {
      testNameReplace = `<a href='${report.testScriptUrl}'>${report.testName}</a>`;
    }
    const header = report.header.replace(report.testName, testNameReplace);
    renderFunc(header, {htmlId: htmlId});
    if (!report.cases) {
      return;
    }
    if (report.testScriptUrl) {
      const fileName = report.fileName ? report.fileName : 'your test code';
      renderFunc(`🔧  <a href="#${report.testScriptUrl}"'>Quick fix for copy-pasting</a> into ${fileName}.`, {htmlId: htmlId});
    }

    report.cases.forEach(cas => {
      renderFunc(cas.header, {indent: 2, htmlId: htmlId});
      renderFunc('got:', {indent: 4, htmlId: htmlId});
        renderFunc(cas.got, {indent: 6, htmlId: htmlId});
      renderFunc('want:', {indent: 4, htmlId: htmlId});
      renderFunc(cas.want, {indent: 6, htmlId: htmlId});
      if (cas.stackTrace) {
        renderFunc('stack trace:', {indent: 4, htmlId: htmlId});
        renderFunc(cas.stackTrace, {indent: 6, htmlId: htmlId});
      }
    });
    report.fileName ? report.fileName : 'your test code';
  }

  // import {genFix} from './fix.js';
  // import { readFileSync, writeFileSync } from 'fs';

  const verboseReportStart = '--vrstart--';

  const resetColor = `\x1b[0m`;
  const hiddenColor = `\x1b[8m`;

  function renderInNonBrowser(testReport, failureReports, callerInfo) {
    if (failureReports.length) {
      consoleRenderFunc([
        verboseReportStart,
        JSON.stringify({
          filePath: callerInfo.filePath,
          failureReports: failureReports.map(fRep => {
            return {
              name: fRep.name,
              errString: fRep.errString ? fRep.errString : undefined,
              got: fRep.errString ? undefined : fRep.got,
            };
          }),
        }),
      ].join(''), {color: hiddenColor});
      consoleRenderFunc('--'.repeat(20), {color: resetColor});
      consoleRenderFunc('');
    }

    renderTestReport(testReport, consoleRenderFunc);

    if (failureReports.length) {
      consoleRenderFunc(`\n🔧 ✅ To auto-fix the above test (i.e. assuming that the implementation is correct), run the following:`);
      consoleRenderFunc(`${process.argv.join(' ')} | npx @clubfest/table-test\n`, {indent: 4});
    }

  }

  function consoleRenderFunc(possStr, opts) {
    opts = opts || {};
    const lines = possStr ? possStr.split('\n') : [possStr];
    lines.forEach(line => {
      const args = opts.color ? [`${opts.color}%s`] : [`${resetColor}%s`];
      args.push(' '.repeat(opts.indent || 0) + line);
      console.log(...args);
    });
  }

  function genFix(failureReports, lines) {
    // All fields will be mutated as we go thru each failureReport.
    const res = {
      lines: lines,
      changeIntervals: [],
      tcBlocks: [],
    };
    failureReports.forEach(fRep => {
      const currLines = res.lines;
      const tcBlock = findTestCaseBlock(currLines, fRep);
      if (!tcBlock) {
        console.warn('Failed to find the code block for this test case: ', fRep);
        return;
      }
      let wantBlock = findWantBlock(currLines, tcBlock);
      if (!wantBlock) {
        wantBlock = {
          startIdx: tcBlock.endIdx,
          endIdx: tcBlock.endIdx,
        };
      }
    
      const newWantLines = computeNewWantLines(fRep, tcBlock.blockIndentLevel);
      res.lines = currLines.slice(0, wantBlock.startIdx).concat(newWantLines).concat(currLines.slice(wantBlock.endIdx));
      res.changeIntervals.push({
        startIdx: wantBlock.startIdx,
        endIdx: wantBlock.startIdx + newWantLines.length,
      });
      res.tcBlocks.push(tcBlock);
    });
    
    return res;
  }

  function computeNewWantLines(fRep, blockIndentLevel) {
    const errString = fRep.errString;
    const wantField = errString ? 'wantErrSubstring' : 'want';
    const got = errString ? errString : fRep.got;
    if (got === undefined) {
      return [];
    }
    const jsonLines = JSON.stringify(got, null, 2).split('\n');
    return jsonLines.map((line, idx) => {
      const res = [' '.repeat(blockIndentLevel)];
      if (idx == 0) {
        res.push(`${wantField}: `);
      }
      res.push(line);
      if (idx == jsonLines.length - 1) {
        res.push(',');
      }
      return res.join('');
    });
  }

  // Empty line will have -1 as indent level.
  function computeIndentLevel(line) {
    if (line.trimStart().length == 0) {
      return -1;
    }
    return line.length - line.trimStart().length;
  }

  function matchLine(line, field, value) {
    let regExp = `\\s*${field}:`;
    if (value) {
      regExp += `\\s*['"\`]${value}['"\`]`;
    }
    return line.match(regExp);
  }

  function computeBlock(lines, idx) {
    const blockIndentLevel = computeIndentLevel(lines[idx]);

    let startIdx = idx - 1;
    for (; startIdx >= 0; startIdx--) {
      const currIndentLevel = computeIndentLevel(lines[startIdx]);
      if (currIndentLevel != -1 && currIndentLevel < blockIndentLevel) {
        startIdx++;
        break;
      }
    }
    let endIdx = idx + 1;
    for (; endIdx < lines.length; endIdx++) {
      const currIndentLevel = computeIndentLevel(lines[endIdx]);
      if (currIndentLevel != -1 && currIndentLevel < blockIndentLevel) {
        break;
      }
    }
    return {
      startIdx: startIdx,
      endIdx: endIdx,
      blockIndentLevel: blockIndentLevel,
    };
  }

  function computeSubBlock(lines, idx) {
    const blockIndentLevel = computeIndentLevel(lines[idx]);

    let startIdx = idx - 1;
    for (; startIdx >= 0; startIdx--) {
      const currIndentLevel = computeIndentLevel(lines[startIdx]);
      if (currIndentLevel != -1 && currIndentLevel <= blockIndentLevel) {
        startIdx++;
        break;
      }
    }
    let endIdx = idx + 1;
    for (; endIdx < lines.length; endIdx++) {
      const currLine = lines[endIdx];
      const currIndentLevel = computeIndentLevel(currLine);
      if (currIndentLevel != -1 && currIndentLevel <= blockIndentLevel) {
        if (currIndentLevel == blockIndentLevel && !currLine.includes(':')) {
          endIdx++;
        }
        break;
      }
    }
    return {
      startIdx: startIdx,
      endIdx: endIdx,
      blockIndentLevel: blockIndentLevel,
    };
  }

  function findTestCaseBlock(lines, failureReport) {
    let block = null;
    lines.forEach((line, idx) => {
      const res = matchLine(line, 'name', failureReport.name);
      if (!res) {
        return;
      }
      
      block = computeBlock(lines, idx);
    });
    return block;
  }

  function findWantBlock(lines, tcBlock) {
    let block = null;
    lines.forEach((line, idx)  => {
      if (idx < tcBlock.startIdx || tcBlock.endIdx <= idx) {
        return;
      }
      const res = matchLine(line, '(want|wantErrSubstring|wantFunc)');
      if (!res) {
        return;
      }
      block = computeSubBlock(lines, idx);
    });
    return block;
  }

  async function renderFix(fix) {
    // Clear the test results from the dom first.
    document.body.innerHTML = '';

    const fixClassName = 'fix-line';
    const tcStartClassName = 'fix-tc-start';
    fix.lines.forEach((line, idx) => {
      if (fix.tcBlocks.length > 0 && idx == fix.tcBlocks[0].startIdx - 1) {
        htmlRenderFunc(`<span class='${tcStartClassName}'>${line}</span>`);
        return;
      }
      if (isWithinIntervals(idx, fix.changeIntervals)) {
        htmlRenderFunc(`<span class='${fixClassName}' style='background-color:#C4FFC1'>${line}</span>`);
        return;
      }  
      htmlRenderFunc(line);
    });
    const tcStarts = document.getElementsByClassName(tcStartClassName);
    if (tcStarts.length > 0) {
      tcStarts[0].scrollIntoView();
    }
  }

  function isWithinIntervals(idx, intervals) {
    for (const interval of intervals) {
      if (interval.startIdx <= idx && idx < interval.endIdx) {
        return true;
      }
    }
    return false;
  }

  async function* makeFileLineIterator(fileURL) {
    const utf8Decoder = new TextDecoder('utf-8');
    const response = await fetch(fileURL, {
      cache: 'no-cache',
    });
    const reader = response.body.getReader();
    let { value: chunk, done: readerDone } = await reader.read();
    chunk = chunk ? utf8Decoder.decode(chunk) : '';

    const re = /\n|\r|\r\n/gm;
    let startIndex = 0;

    for (;;) {
      let result = re.exec(chunk);
      if (!result) {
        if (readerDone) {
          break;
        }
        let remainder = chunk.substr(startIndex);
        ({ value: chunk, done: readerDone } = await reader.read());
        chunk = remainder + (chunk ? utf8Decoder.decode(chunk) : '');
        startIndex = re.lastIndex = 0;
        continue;
      }
      yield chunk.substring(startIndex, result.index);
      startIndex = re.lastIndex;
    }
    if (startIndex < chunk.length) {
      // last line didn't end in a newline char
      yield chunk.substr(startIndex);
    }
  }

  async function renderInBrowser(testReport, failureReports, callerInfo) {
    // Re-run 
    window.onhashchange = function() {
      window.location.reload();
    };
    const urlWhoseScriptNeedsFixing = window.location.hash.slice(1);
    if (urlWhoseScriptNeedsFixing) {
      if (urlWhoseScriptNeedsFixing === callerInfo.url) {
        const lines = [];
        for await (let line of makeFileLineIterator(urlWhoseScriptNeedsFixing)) {
          lines.push(line);
        }
        renderFix(genFix(failureReports, lines));
      }
    } else {
      setupDom();
      testReport.testScriptUrl = callerInfo.url;
      renderTestReport(testReport, htmlRenderFunc);
    }
  }

  function getOrInsertHtml(id, tag) {
    const html = document.getElementById(id);
    if (html) {
      return html;
    }
    const newHtml = document.createElement(tag);
    newHtml.id = id;
    document.body.appendChild(newHtml);
    return newHtml;
  }

  function htmlRenderFunc(possStr, opts) {
    opts = opts || {};
    const html = getOrInsertHtml(opts.htmlId || 'passing', 'pre');
    // TODO may want to contain the style within a container span.
    html.style['font-size'] = 'large';
    html.style['padding'] = '9px';

    const lines = possStr ? possStr.split('\n') : [possStr];
    lines.forEach(line => {
      html.innerHTML += ' '.repeat(opts.indent || 0) + line + '\n';
    });
  }

  function setupDom() {
    document.body.style['padding-left'] = '15px';
    const titleHtml = getOrInsertHtml('title-html', 'h2');
    titleHtml.textContent = 'Test Results';
    // Make sure the failing html shows up at the top.
    const failingHtml = getOrInsertHtml('failing', 'pre');
    failingHtml.style['background-color'] = '#FFE4E1';
    failingHtml.style['white-space'] = 'pre-wrap';
    const passingHtml = getOrInsertHtml('passing', 'pre');
    passingHtml.style['background-color'] = '#E4FFE1';
    passingHtml.style['white-space'] = 'pre-wrap';
  }

  function genTestSummary(testResults, testName) {
    const failedResults = testResults.filter(res => {
      return !res.isSuccessful;
    });
    const failureReports = failedResults.map(res => {
      return {
        name: res.name,
        got: res.got,
        want: res.want,
        errString: res.errString,
        stackTrace: res.stackTrace,
      }
    });
    const summary = {
      numTotal: testResults.length,
      numFailures: failedResults.length,
      numSuccesses: testResults.length - failedResults.length,
      failureReports: failureReports,
      testName: testName,
    };
    return summary;
  }

  function jsonStringifyHandlingBigInt(obj) {
    return JSON.stringify(obj, (key, value) => 
      typeof value === 'bigint'
          ? value.toString() + 'n'
          : value // return everything else unchanged
    , 2);
  }

  function genTestReport(testSummary, fileName) {
    if (!testSummary.numFailures) {
      return {
        header: `All ${testSummary.numTotal} cases passed for ${testSummary.testName}.`,
        testName: testSummary.testName,
        fileName: fileName,
      };
    }
    return {
      header: `X ${testSummary.numFailures} / ${testSummary.numTotal} cases failed for ${testSummary.testName}:`,
      testName: testSummary.testName,
      fileName: fileName,
      numFailures: testSummary.numFailures,
      cases: testSummary.failureReports.map(report => {
        const caseReport = {
          header: `X ${report.name}`,
          got: jsonStringifyHandlingBigInt(report.got),
          want: jsonStringifyHandlingBigInt(report.want),
          stackTrace: report.stackTrace,
        };
        return caseReport;
      }),
    }
  }

  // Returns whether or not the test ran successfully.
  // Will display the result in the console and/or browser.
  // Will exit early in Node.js if failfast is not set to false.
  // Post-processing, e.g. exiting with correct status code, is left to the caller.
  // This is because table-test is a library and not a framework,
  // so it cannot perform aggregation of multiple runTest results.
  async function runTest({
      testCases = [], testName = '', setupFunc = null, failfast = true}) {
    // Note that this must be called before any await or else the stack trace will be truncated.
    const callerInfo = getCallerInfo();

    testName = testName || callerInfo.fileName || '';

    const testSummary = genTestSummary(await runTestCases(testCases, setupFunc), testName);
    const testReport = genTestReport(testSummary, callerInfo.fileName);

    if (typeof document !== 'undefined') {
      await renderInBrowser(testReport, testSummary.failureReports, callerInfo);
    } else {
      renderInNonBrowser(testReport, testSummary.failureReports, callerInfo);
    }
    if (failfast && isNodeJs() && testSummary.numFailures > 0) {
      // Fail fast; if we fail slow, we can't control the exit code, since
      // this is a library function, not a framework.
      // This has the added benefit that the tail of the logs will be the
      // most useful info about the failure (i.e. no need to scroll up).
      process.exit(1);
    }
    return testSummary.numFailures == 0;
  }

  function isNodeJs() {
    return (typeof process === 'object') && (typeof process.versions === 'object') && (typeof process.versions.node !== 'undefined');
  }

  function parseHexStringInDerToSignature(hexString) {
      console.log(hexString);
      const firstByte = hexString.slice(0, 2);
      if (firstByte !== '30') {
          throw new Error('Invalid DER signature');
      }
      const length = parseInt(hexString.slice(2, 4), 16);
      if (length * 2 + 4 !== hexString.length) {
          throw new Error('Invalid DER signature');
      }
      const rMarker = hexString.slice(4, 6);
      if (rMarker !== '02') {
          throw new Error('Invalid marker for r in DER signature');
      }
      const rLength = parseInt(hexString.slice(6, 8), 16);
      const r = BigInt('0x' + hexString.slice(8, 8 + rLength * 2));
      const sMarker = hexString.slice(8 + rLength * 2, 10 + rLength * 2);
      if (sMarker !== '02') {
          throw new Error('Invalid marker for s in DER signature');
      }
      const sLength = parseInt(hexString.slice(10 + rLength * 2, 12 + rLength * 2), 16);
      const s = BigInt('0x' + hexString.slice(12 + rLength * 2, 12 + rLength * 2 + sLength * 2));
      return new Signature(r, s);
  }
  class Signature {
      constructor(r, s) {
          this.r = r;
          this.s = s;
      }
      getDerHexString() {
          const metadata = [];
          // 1. Start with the 0x30 byte.
          metadata.push(0x30);
          const rData = encodeSigComponent(this.r);
          const sData = encodeSigComponent(this.s);
          const data = rData.concat(sData);
          // 2. Encode the length of the rest of the signature (usually 0x44 or 0x45) and append.
          metadata.push(data.length);
          return bytesToHexString(metadata.concat(data));
      }
  }
  function bytesToHexString(bytes) {
      return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function encodeSigComponent(bigInt) {
      const data = [];
      // 3. Append the marker byte, 0x02.
      data.push(0x02);
      // 4. Encode r as a big-endian integer, removing all null bytes at the beginning.
      let bigIntInBytes = bigIntToBigEndianBytes(bigInt);
      // if bigInt has a high bit, add a \x00
      if (bigIntInBytes[0] >= 0x80) {
          bigIntInBytes = [0x00].concat(bigIntInBytes);
      }
      data.push(bigIntInBytes.length);
      data.push(...bigIntInBytes);
      console.log(data);
      console.log(bigIntInBytes.length);
      return data;
  }
  function bigIntToBigEndianBytes(input) {
      let hexString = input.toString(16);
      if (hexString.length % 2 !== 0) {
          hexString = '0' + hexString;
      }
      const result = [];
      for (let i = 0; i < hexString.length; i += 2) {
          result.push(parseInt(hexString.slice(i, i + 2), 16));
      }
      return result;
  }

  const tests$4 = [
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
                  got: (new Signature(BigInt('0x37206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c6'), BigInt('0x8ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec'))).getDerHexString(),
                  want: '3045022037206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c60221008ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec',
              },
              {
                  name: 'big',
                  got: (new Signature(BigInt('0x37206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c6'), BigInt('0x8ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec'))).der(),
                  want: '3045022037206a0610995c58074999cb9767b87af4c4978db68c06e8e6e81d282047a7c60221008ca63759c1157ebeaec0d03cecca119fc9a75bf8e6d0fa65c841c8e2738cdaec',
              },
          ],
      },
  ];
  tests$4.forEach(test => {
      runTest(test);
  });

  function mod(a, b) {
      return ((a % b) + b) % b;
  }
  function modExp(base, exponent, prime) {
      // Handle negative exponents or exponents bigger than prime via Fermat's little theorem
      let currentExp = mod(exponent, prime - 1n);
      // Implementing the binary exponentiation algorithm
      let result = 1n;
      let baseToThePowerOfI = base;
      while (currentExp > 0n) {
          if (currentExp % 2n === 1n) {
              result = mod(result * baseToThePowerOfI, prime);
          }
          currentExp >>= 1n;
          baseToThePowerOfI = mod(baseToThePowerOfI * baseToThePowerOfI, prime);
      }
      return result;
  }

  class FieldElement {
      constructor(num, prime) {
          this.num = num;
          this.prime = prime;
          if (num >= prime || num < 0n) {
              throw new Error('Num must be in range 0 to prime');
          }
      }
      equals(other) {
          return this.num === other.num && this.prime === other.prime;
      }
      plus(other) {
          if (this.prime !== other.prime) {
              throw new Error('Cannot add two numbers in different Fields');
          }
          const num = mod(this.num + other.num, this.prime);
          return new FieldElement(num, this.prime);
      }
      minus(other) {
          if (this.prime !== other.prime) {
              throw new Error('Cannot subtract two numbers in different Fields');
          }
          const num = mod(this.num - other.num, this.prime);
          return new FieldElement(num, this.prime);
      }
      times(other) {
          if (this.prime !== other.prime) {
              throw new Error('Cannot multiply two numbers in different Fields');
          }
          const num = mod(this.num * other.num, this.prime);
          return new FieldElement(num, this.prime);
      }
      scalarMultiply(scalar) {
          const num = mod(this.num * scalar, this.prime);
          return new FieldElement(num, this.prime);
      }
      toThePower(exponent) {
          const n = mod(exponent, this.prime - 1n);
          const num = modExp(this.num, n, this.prime);
          return new FieldElement(num, this.prime);
      }
      dividedBy(other) {
          if (this.prime !== other.prime) {
              throw new Error('Cannot divide two numbers in different Fields');
          }
          // this.num and other.num are the actual values
          // this.prime is what we need to mod against
          // use fermat's little theorem:
          // this.num**(p-1) % p == 1
          // this means:
          // 1/n == pow(n, p-2, p)
          const num = mod(this.num * modExp(other.num, this.prime - 2n, this.prime), this.prime);
          return new FieldElement(num, this.prime);
      }
      isZero() {
          return this.num === 0n;
      }
  }

  class ZeroPoint {
      constructor(a, b) {
          this.a = a;
          this.b = b;
      }
      equals(other) {
          return other instanceof ZeroPoint && this.a === other.a && this.b === other.b;
      }
      plus(other) {
          return other;
      }
      scalarMultiply(_scalar) {
          return this;
      }
      inverse() {
          return this;
      }
      clone() {
          return new ZeroPoint(this.a, this.b);
      }
      isZero() {
          return true;
      }
  }
  class NonzeroPoint {
      constructor(x, y, a, b) {
          this.x = x;
          this.y = y;
          this.a = a;
          this.b = b;
          if (!x.times(x).times(x).plus(a.times(x)).plus(b).minus(y.times(y)).isZero()) {
              throw new Error(`Invalid point. x: ${x.num}, y: ${y.num}, x^3 + ax + b: ${x.times(x).times(x).plus(a.times(x)).plus(b).num}, y^2: ${y.times(y).num}`);
          }
      }
      clone() {
          return new NonzeroPoint(this.x, this.y, this.a, this.b);
      }
      isZero() {
          return false;
      }
      equals(other) {
          if (other instanceof ZeroPoint) {
              return false;
          }
          return this.x.equals(other.x) && this.y.equals(other.y) && this.a.equals(other.a) && this.b.equals(other.b);
      }
      plus(other) {
          if (!this.a.equals(other.a) || !this.b.equals(other.b)) {
              throw new Error('Points must be on the same curve');
          }
          // Adding the point to the zero point
          if (other instanceof ZeroPoint) {
              return this;
          }
          // Adding the same point
          if (this.equals(other)) {
              // if y == 0, return zero
              if (this.y.num === 0n) {
                  return new ZeroPoint(this.a, this.b);
              }
              const s = this.x.toThePower(2n).scalarMultiply(3n).plus(this.a).dividedBy(this.y.scalarMultiply(2n));
              const x = s.toThePower(2n).minus(this.x.scalarMultiply(2n));
              const y = s.times(this.x.minus(x)).minus(this.y);
              return new NonzeroPoint(x, y, this.a, this.b);
          }
          // Adding the inverse point
          if (this.x.equals(other.x) && !this.y.equals(other.y)) {
              return new ZeroPoint(this.a, this.b);
          }
          // Adding two different points
          const s = other.y.minus(this.y).dividedBy(other.x.minus(this.x));
          const x = s.toThePower(2n).minus(this.x).minus(other.x);
          const y = s.times(this.x.minus(x)).minus(this.y);
          return new NonzeroPoint(x, y, this.a, this.b);
      }
      inverse() {
          return new NonzeroPoint(this.x, this.y.scalarMultiply(-1n), this.a, this.b);
      }
      scalarMultiply(multiplier) {
          // Handle negative scalar
          if (multiplier < 0) {
              return this.inverse().scalarMultiply(-multiplier);
          }
          let result = new ZeroPoint(this.a, this.b);
          let current = this.clone();
          let currentMultiplier = multiplier;
          while (currentMultiplier) {
              if (currentMultiplier & 1n) {
                  result = result.plus(current);
              }
              current = current.plus(current);
              currentMultiplier = currentMultiplier >> 1n;
          }
          return result;
      }
  }

  const prime$1 = 2n ** 256n - 2n ** 32n - 2n ** 9n - 2n ** 8n - 2n ** 7n - 2n ** 6n - 2n ** 4n - 1n;
  const a$1 = new FieldElement(0n, prime$1);
  const b$1 = new FieldElement(7n, prime$1);
  const generatorOrder = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
  const generator = makeGenerator();
  function makeSecp256Point(x, y) {
      return new NonzeroPoint(new FieldElement(x, prime$1), new FieldElement(y, prime$1), a$1, b$1);
  }
  function makeSecp256PointFromHex(x, y) {
      return makeSecp256Point(BigInt("0x" + x), BigInt("0x" + y));
  }
  function makeGenerator() {
      const xNum = 55066263022277343669578718895168534326250603453777594175500187360389116729240n;
      const yNum = 32670510020758816978083085130507043184471273380659243275938904335757337482424n;
      return makeSecp256Point(xNum, yNum);
  }
  function serializeInCompressedSecFormat(point) {
      const x = point.x.num.toString(16).padStart(64, "0");
      if (point.y.num % 2n === 0n) {
          return "02" + x;
      }
      return "03" + x;
  }
  function serializeInUncompressedSecFormat(point) {
      const x = point.x.num.toString(16).padStart(64, "0");
      const y = point.y.num.toString(16).padStart(64, "0");
      return "04" + x + y;
  }
  function deserializeFromSecFormat(hex) {
      const marker = hex.slice(0, 2);
      if (marker === "04") {
          return makeSecp256PointFromHex(hex.slice(2, 66), hex.slice(66, 130));
      }
      if (marker !== "02" && marker !== "03") {
          throw new Error("Invalid marker");
      }
      const isEven = marker === "02";
      const x = new FieldElement(BigInt("0x" + hex.slice(2, 66)), prime$1);
      const alpha = x.toThePower(3n).plus(b$1);
      // beta is the square root of alpha using Fermat's little theorem.
      const beta = alpha.toThePower((prime$1 + 1n) / 4n);
      let even_beta = beta.num % 2n === 0n ? beta : new FieldElement(prime$1 - beta.num, prime$1);
      let odd_beta = beta.num % 2n === 0n ? new FieldElement(prime$1 - beta.num, prime$1) : beta;
      return isEven ? makeSecp256Point(x.num, even_beta.num) : makeSecp256Point(x.num, odd_beta.num);
  }

  const tests$3 = [
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
                  got: serializeInCompressedSecFormat(generator.scalarMultiply(123n)),
                  want: '03a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5'
              },
              {
                  name: 'uncompressed sec serialization',
                  got: serializeInUncompressedSecFormat(generator.scalarMultiply(123n)),
                  want: '04a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5204b5d6f84822c307e4b4a7140737aec23fc63b65b35f86a10026dbd2d864e6b'
              }
          ],
      },
      {
          testName: 'serialize and deserialize',
          testCases: [
              {
                  name: 'compressed',
                  got: deserializeFromSecFormat(serializeInCompressedSecFormat(generator.scalarMultiply(123n))),
                  want: generator.scalarMultiply(123n),
              },
              {
                  name: 'uncompressed',
                  got: deserializeFromSecFormat(serializeInUncompressedSecFormat(generator.scalarMultiply(1234n))),
                  want: generator.scalarMultiply(1234n),
              },
          ],
      }
  ];
  tests$3.forEach(test => {
      runTest(test);
  });

  async function hmacSha256(secret, message) {
      // Encode as UTF-8, i.e. each character is 1 uint8 element in the Uint8Array.
      const algorithm = { name: "HMAC", hash: "SHA-256" };
      const key = await crypto.subtle.importKey("raw", secret, algorithm, false, ["sign", "verify"]);
      const hashBuffer = await crypto.subtle.sign(algorithm.name, key, message);
      return new Uint8Array(hashBuffer);
  }

  class PublicKey {
      constructor(point) {
          this.point = point;
      }
      verify(z, signature) {
          const sInv = modExp(signature.s, generatorOrder - 2n, generatorOrder);
          const u = z * sInv % generatorOrder;
          const v = signature.r * sInv % generatorOrder;
          const total = generator.scalarMultiply(u).plus(this.point.scalarMultiply(v));
          if (total instanceof NonzeroPoint) {
              return total.x.num === signature.r;
          }
          return false;
      }
  }

  class PrivateKey {
      constructor(secret) {
          this.secret = secret;
          if (secret >= generatorOrder || secret < 0n) {
              throw new Error(`Secret is out of range: ${secret}`);
          }
          const point = generator.scalarMultiply(this.secret);
          if (point instanceof ZeroPoint) {
              throw new Error('Point is zero');
          }
          this.publicKey = new PublicKey(point);
      }
      async sign(z) {
          const k = await deterministicK(z, this.secret);
          const kG = generator.scalarMultiply(k);
          if (kG instanceof ZeroPoint) {
              throw new Error(`kG is zero. k: ${k}, z: ${z}`);
          }
          const r = kG.x.num;
          const kInv = modExp(k, generatorOrder - 2n, generatorOrder);
          let s = mod(kInv * (z + r * this.secret), generatorOrder);
          if (s > generatorOrder / 2n) {
              s = generatorOrder - s;
          }
          return new Signature(r, s);
      }
  }
  async function deterministicK(z, secret) {
      // RFC 6979
      let k = new Uint8Array(32);
      let v = new Uint8Array(32);
      v.fill(1);
      if (z > generatorOrder) {
          z -= generatorOrder;
      }
      const zBytes = z.toString(16).padStart(64, '0');
      const secretBytes = secret.toString(16).padStart(64, '0');
      const messageHexString = uint8ArrayToHexString(v) + '00' + secretBytes + zBytes;
      k = await hmacSha256(k, hexToUint8Array(messageHexString));
      v = await hmacSha256(k, v);
      k = await hmacSha256(k, hexToUint8Array(uint8ArrayToHexString(v) + '01' + secretBytes + zBytes));
      v = await hmacSha256(k, v);
      while (true) {
          v = await hmacSha256(k, v);
          const candidate = BigInt('0x' + uint8ArrayToHexString(v));
          if (candidate >= 1 && candidate < generatorOrder) {
              return candidate;
          }
          k = await hmacSha256(k, hexToUint8Array(uint8ArrayToHexString(v) + '00'));
          v = await hmacSha256(k, v);
      }
  }
  // Convert a hex string to a byte array
  function hexToUint8Array(hex) {
      if (hex.length % 2 !== 0) {
          throw new Error(`Hex string must have even length: ${hex}`);
      }
      const result = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
          result[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return result;
  }
  function uint8ArrayToHexString(array) {
      return Array.from(array)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
  }

  const tests$2 = [
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
                      const point = new NonzeroPoint(new FieldElement(BigInt('0x887387e452b8eacc4acfde10d9aaf7f6d9a0f975aabb10d006e4da568744d06c'), prime$1), new FieldElement(BigInt('0x61de6d95231cd89026e286df3b6ae4a894a3378e393e93a0f45b666329a0ae34'), prime$1), a$1, b$1);
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
  tests$2.forEach(test => {
      runTest(test);
  });

  // Import point.ts and test plus() and equals() methods
  const tests$1 = [{
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
  tests$1.forEach(test => {
      runTest(test);
  });

  // Import point.ts and test plus() and equals() methods
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

})();
//# sourceMappingURL=testMain.js.map
