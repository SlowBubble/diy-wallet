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

  class BytesReader {
      constructor(bytes, offset = 0) {
          this.bytes = bytes;
          this.offset = offset;
      }
      read(length) {
          const bytes = this.bytes.slice(this.offset, this.offset + length);
          this.offset += length;
          return bytes;
      }
      isFinished() {
          return this.offset >= this.bytes.length;
      }
  }

  function makeByte(x) {
      if (x < 0) {
          throw new Error('byte cannot be negative.');
      }
      if (x > 255) {
          throw new Error('byte cannot be greater than 255.');
      }
      if (Number.isInteger(x) === false) {
          throw new Error('byte must be an integer.');
      }
      return x;
  }
  function makeBytes(x) {
      return x.map(makeByte);
  }
  function makeBytesObj(bytes) {
      return new BytesObj(bytes);
  }
  class BytesObj {
      constructor(bytes) {
          this.bytes = bytes;
      }
      static fromBytes(bytes) {
          return new BytesObj(bytes);
      }
      toBytes() {
          return this.bytes;
      }
      // Assumes array elements are bytes (e.g. by the context of the code).
      static fromSafeArray(array) {
          return new BytesObj(makeBytes(array));
      }
      toArray() {
          return this.toBytes();
      }
      static fromHexString(hexString) {
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
      static fromUint8Array(array) {
          return BytesObj.fromSafeArray(Array.from(array));
      }
      toUint8Array() {
          return new Uint8Array(this.toBytes());
      }
      static fromLittleEndianNum(num, numberOfBytes = 0) {
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
      static fromBigEndianNum(num) {
          const bigEndianBytes = BytesObj.fromLittleEndianNum(num);
          return new BytesObj(bigEndianBytes.toBytes().reverse());
      }
      toBigEndianNum() {
          return BigInt('0x' + this.toBytes().map(byte => byte.toString(16).padStart(2, '0')).join(''));
      }
      static fromUtf8String(utf8String) {
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

  async function hmacSha256(secret, message) {
      // Encode as UTF-8, i.e. each character is 1 uint8 element in the Uint8Array.
      const algorithm = { name: "HMAC", hash: "SHA-256" };
      const key = await crypto.subtle.importKey("raw", secret, algorithm, false, ["sign", "verify"]);
      const hashBuffer = await crypto.subtle.sign(algorithm.name, key, message);
      return new Uint8Array(hashBuffer);
  }

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

  const prime = 2n ** 256n - 2n ** 32n - 2n ** 9n - 2n ** 8n - 2n ** 7n - 2n ** 6n - 2n ** 4n - 1n;
  const a = new FieldElement(0n, prime);
  const b = new FieldElement(7n, prime);
  const generatorOrder = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
  const generator = makeGenerator();
  function makeSecp256Point(x, y) {
      return new NonzeroPoint(new FieldElement(x, prime), new FieldElement(y, prime), a, b);
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
  function deserializeFromSecFormat(hex) {
      const marker = hex.slice(0, 2);
      if (marker === "04") {
          return makeSecp256PointFromHex(hex.slice(2, 66), hex.slice(66, 130));
      }
      if (marker !== "02" && marker !== "03") {
          throw new Error(`Invalid marker: ${marker}; hex: ${hex}`);
      }
      const isEven = marker === "02";
      const x = new FieldElement(BigInt("0x" + hex.slice(2, 66)), prime);
      const alpha = x.toThePower(3n).plus(b);
      // beta is the square root of alpha using Fermat's little theorem.
      const beta = alpha.toThePower((prime + 1n) / 4n);
      let even_beta = beta.num % 2n === 0n ? beta : new FieldElement(prime - beta.num, prime);
      let odd_beta = beta.num % 2n === 0n ? new FieldElement(prime - beta.num, prime) : beta;
      return isEven ? makeSecp256Point(x.num, even_beta.num) : makeSecp256Point(x.num, odd_beta.num);
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

  function parseHexStringInDerToSignature(hexString) {
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
      getDerBytes() {
          const metadata = [];
          // 1. Start with the 0x30 byte.
          metadata.push(0x30);
          const rData = encodeSigComponent(this.r);
          const sData = encodeSigComponent(this.s);
          const data = rData.concat(sData);
          // 2. Encode the length of the rest of the signature (usually 0x44 or 0x45) and append.
          metadata.push(makeByte(data.length));
          return metadata.concat(data);
      }
      getDerHexString() {
          return bytesToHexString(this.getDerBytes());
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
      let bigIntInBytes = BytesObj.fromBigEndianNum(bigInt).toBytes();
      // if bigInt has a high bit, add a \x00
      if (bigIntInBytes[0] >= 0x80) {
          bigIntInBytes = makeBytes([0x00].concat(bigIntInBytes));
      }
      data.push(makeByte(bigIntInBytes.length));
      data.push(...bigIntInBytes);
      return data;
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
          throw new Error(`Hex string must have even length: ${hex.length}`);
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

  function number(n) {
      if (!Number.isSafeInteger(n) || n < 0)
          throw new Error(`Wrong positive integer: ${n}`);
  }
  function bool(b) {
      if (typeof b !== 'boolean')
          throw new Error(`Expected boolean, not ${b}`);
  }
  function bytes(b, ...lengths) {
      if (!(b instanceof Uint8Array))
          throw new TypeError('Expected Uint8Array');
      if (lengths.length > 0 && !lengths.includes(b.length))
          throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
  }
  function hash(hash) {
      if (typeof hash !== 'function' || typeof hash.create !== 'function')
          throw new Error('Hash should be wrapped by utils.wrapConstructor');
      number(hash.outputLen);
      number(hash.blockLen);
  }
  function exists(instance, checkFinished = true) {
      if (instance.destroyed)
          throw new Error('Hash instance has been destroyed');
      if (checkFinished && instance.finished)
          throw new Error('Hash#digest() has already been called');
  }
  function output(out, instance) {
      bytes(out);
      const min = instance.outputLen;
      if (out.length < min) {
          throw new Error(`digestInto() expects output buffer of length at least ${min}`);
      }
  }
  const assert = {
      number,
      bool,
      bytes,
      hash,
      exists,
      output,
  };

  /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  // Cast array to view
  const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  // big-endian hardware is rare. Just in case someone still decides to run hashes:
  // early-throw an error because we don't support BE yet.
  const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
  if (!isLE)
      throw new Error('Non little-endian hardware is not supported');
  Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
  function utf8ToBytes(str) {
      if (typeof str !== 'string') {
          throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
      }
      return new TextEncoder().encode(str);
  }
  function toBytes(data) {
      if (typeof data === 'string')
          data = utf8ToBytes(data);
      if (!(data instanceof Uint8Array))
          throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
      return data;
  }
  // For runtime check if class implements interface
  class Hash {
      // Safe version that clones internal state
      clone() {
          return this._cloneInto();
      }
  }
  function wrapConstructor(hashConstructor) {
      const hashC = (message) => hashConstructor().update(toBytes(message)).digest();
      const tmp = hashConstructor();
      hashC.outputLen = tmp.outputLen;
      hashC.blockLen = tmp.blockLen;
      hashC.create = () => hashConstructor();
      return hashC;
  }

  // Polyfill for Safari 14
  function setBigUint64(view, byteOffset, value, isLE) {
      if (typeof view.setBigUint64 === 'function')
          return view.setBigUint64(byteOffset, value, isLE);
      const _32n = BigInt(32);
      const _u32_max = BigInt(0xffffffff);
      const wh = Number((value >> _32n) & _u32_max);
      const wl = Number(value & _u32_max);
      const h = isLE ? 4 : 0;
      const l = isLE ? 0 : 4;
      view.setUint32(byteOffset + h, wh, isLE);
      view.setUint32(byteOffset + l, wl, isLE);
  }
  // Base SHA2 class (RFC 6234)
  class SHA2 extends Hash {
      constructor(blockLen, outputLen, padOffset, isLE) {
          super();
          this.blockLen = blockLen;
          this.outputLen = outputLen;
          this.padOffset = padOffset;
          this.isLE = isLE;
          this.finished = false;
          this.length = 0;
          this.pos = 0;
          this.destroyed = false;
          this.buffer = new Uint8Array(blockLen);
          this.view = createView(this.buffer);
      }
      update(data) {
          assert.exists(this);
          const { view, buffer, blockLen } = this;
          data = toBytes(data);
          const len = data.length;
          for (let pos = 0; pos < len;) {
              const take = Math.min(blockLen - this.pos, len - pos);
              // Fast path: we have at least one block in input, cast it to view and process
              if (take === blockLen) {
                  const dataView = createView(data);
                  for (; blockLen <= len - pos; pos += blockLen)
                      this.process(dataView, pos);
                  continue;
              }
              buffer.set(data.subarray(pos, pos + take), this.pos);
              this.pos += take;
              pos += take;
              if (this.pos === blockLen) {
                  this.process(view, 0);
                  this.pos = 0;
              }
          }
          this.length += data.length;
          this.roundClean();
          return this;
      }
      digestInto(out) {
          assert.exists(this);
          assert.output(out, this);
          this.finished = true;
          // Padding
          // We can avoid allocation of buffer for padding completely if it
          // was previously not allocated here. But it won't change performance.
          const { buffer, view, blockLen, isLE } = this;
          let { pos } = this;
          // append the bit '1' to the message
          buffer[pos++] = 0b10000000;
          this.buffer.subarray(pos).fill(0);
          // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
          if (this.padOffset > blockLen - pos) {
              this.process(view, 0);
              pos = 0;
          }
          // Pad until full block byte with zeros
          for (let i = pos; i < blockLen; i++)
              buffer[i] = 0;
          // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
          // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
          // So we just write lowest 64 bits of that value.
          setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
          this.process(view, 0);
          const oview = createView(out);
          const len = this.outputLen;
          // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
          if (len % 4)
              throw new Error('_sha2: outputLen should be aligned to 32bit');
          const outLen = len / 4;
          const state = this.get();
          if (outLen > state.length)
              throw new Error('_sha2: outputLen bigger than state');
          for (let i = 0; i < outLen; i++)
              oview.setUint32(4 * i, state[i], isLE);
      }
      digest() {
          const { buffer, outputLen } = this;
          this.digestInto(buffer);
          const res = buffer.slice(0, outputLen);
          this.destroy();
          return res;
      }
      _cloneInto(to) {
          to || (to = new this.constructor());
          to.set(...this.get());
          const { blockLen, buffer, length, finished, destroyed, pos } = this;
          to.length = length;
          to.pos = pos;
          to.finished = finished;
          to.destroyed = destroyed;
          if (length % blockLen)
              to.buffer.set(buffer);
          return to;
      }
  }

  // https://homes.esat.kuleuven.be/~bosselae/ripemd160.html
  // https://homes.esat.kuleuven.be/~bosselae/ripemd160/pdf/AB-9601/AB-9601.pdf
  const Rho = new Uint8Array([7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8]);
  const Id = Uint8Array.from({ length: 16 }, (_, i) => i);
  const Pi = Id.map((i) => (9 * i + 5) % 16);
  let idxL = [Id];
  let idxR = [Pi];
  for (let i = 0; i < 4; i++)
      for (let j of [idxL, idxR])
          j.push(j[i].map((k) => Rho[k]));
  const shifts = [
      [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
      [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
      [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
      [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
      [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5],
  ].map((i) => new Uint8Array(i));
  const shiftsL = idxL.map((idx, i) => idx.map((j) => shifts[i][j]));
  const shiftsR = idxR.map((idx, i) => idx.map((j) => shifts[i][j]));
  const Kl = new Uint32Array([0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]);
  const Kr = new Uint32Array([0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]);
  // The rotate left (circular left shift) operation for uint32
  const rotl = (word, shift) => (word << shift) | (word >>> (32 - shift));
  // It's called f() in spec.
  function f(group, x, y, z) {
      if (group === 0)
          return x ^ y ^ z;
      else if (group === 1)
          return (x & y) | (~x & z);
      else if (group === 2)
          return (x | ~y) ^ z;
      else if (group === 3)
          return (x & z) | (y & ~z);
      else
          return x ^ (y | ~z);
  }
  // Temporary buffer, not used to store anything between runs
  const BUF = new Uint32Array(16);
  class RIPEMD160 extends SHA2 {
      constructor() {
          super(64, 20, 8, true);
          this.h0 = 0x67452301 | 0;
          this.h1 = 0xefcdab89 | 0;
          this.h2 = 0x98badcfe | 0;
          this.h3 = 0x10325476 | 0;
          this.h4 = 0xc3d2e1f0 | 0;
      }
      get() {
          const { h0, h1, h2, h3, h4 } = this;
          return [h0, h1, h2, h3, h4];
      }
      set(h0, h1, h2, h3, h4) {
          this.h0 = h0 | 0;
          this.h1 = h1 | 0;
          this.h2 = h2 | 0;
          this.h3 = h3 | 0;
          this.h4 = h4 | 0;
      }
      process(view, offset) {
          for (let i = 0; i < 16; i++, offset += 4)
              BUF[i] = view.getUint32(offset, true);
          // prettier-ignore
          let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
          // Instead of iterating 0 to 80, we split it into 5 groups
          // And use the groups in constants, functions, etc. Much simpler
          for (let group = 0; group < 5; group++) {
              const rGroup = 4 - group;
              const hbl = Kl[group], hbr = Kr[group]; // prettier-ignore
              const rl = idxL[group], rr = idxR[group]; // prettier-ignore
              const sl = shiftsL[group], sr = shiftsR[group]; // prettier-ignore
              for (let i = 0; i < 16; i++) {
                  const tl = (rotl(al + f(group, bl, cl, dl) + BUF[rl[i]] + hbl, sl[i]) + el) | 0;
                  al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl; // prettier-ignore
              }
              // 2 loops are 10% faster
              for (let i = 0; i < 16; i++) {
                  const tr = (rotl(ar + f(rGroup, br, cr, dr) + BUF[rr[i]] + hbr, sr[i]) + er) | 0;
                  ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr; // prettier-ignore
              }
          }
          // Add the compressed chunk to the current hash value
          this.set((this.h1 + cl + dr) | 0, (this.h2 + dl + er) | 0, (this.h3 + el + ar) | 0, (this.h4 + al + br) | 0, (this.h0 + bl + cr) | 0);
      }
      roundClean() {
          BUF.fill(0);
      }
      destroy() {
          this.destroyed = true;
          this.buffer.fill(0);
          this.set(0, 0, 0, 0, 0);
      }
  }
  /**
   * RIPEMD-160 - a hash function from 1990s.
   * @param message - msg that would be hashed
   */
  const ripemd160 = wrapConstructor(() => new RIPEMD160());

  function isData(cmd) {
      return typeof cmd !== 'number';
  }
  function isOpCode(cmd) {
      return typeof cmd === 'number';
  }
  class OpContext {
      constructor(stack = [], altStack = [], cmds = [], z = 0n) {
          this.stack = stack;
          this.altStack = altStack;
          this.cmds = cmds;
          this.z = z;
      }
  }
  // Rules for encoding/decoding between bigint and stack element:
  // - 0 is an empty byte array
  // - encode the positive part as a little endian byte array
  // - handle the last bit of last byte specially so that it is 0 for positive numbers and 1 for negative numbers
  //   - just modify the existing last bit of last byte if it was 0
  //   - add a new byte if the last bit of last byte was 1
  function encodeBigIntToStackElement(num) {
      if (num === 0n) {
          return [];
      }
      const negative = num < 0;
      const absNum = negative ? -num : num;
      const bytesForAbsNum = BytesObj.fromLittleEndianNum(absNum).toBytes();
      const lastByteForAbsNum = bytesForAbsNum[bytesForAbsNum.length - 1];
      const lastBitOfLastByteIsOneForAbsNum = lastByteForAbsNum & 0x80;
      if (negative && (lastBitOfLastByteIsOneForAbsNum)) {
          return bytesForAbsNum.concat(0x80);
      }
      if (negative) {
          const lastByte = makeByte(lastByteForAbsNum | 0x80);
          return bytesForAbsNum.slice(0, bytesForAbsNum.length - 1).concat(lastByte);
      }
      if (lastBitOfLastByteIsOneForAbsNum) {
          return bytesForAbsNum.concat(0);
      }
      return bytesForAbsNum;
  }
  function decodeStackElementToBigInt(stackElement) {
      if (stackElement.length === 0) {
          return BigInt(0);
      }
      const lastByte = stackElement[stackElement.length - 1];
      const lastBitOfLastByteIsOne = lastByte & 0x80;
      if (lastBitOfLastByteIsOne) {
          return -makeBytesObj(stackElement.slice(0, stackElement.length - 1)).toLittleEndianNum();
      }
      return makeBytesObj(stackElement).toLittleEndianNum();
  }
  function genOpNumFunc(num) {
      return async (ctx) => {
          ctx.stack.push(encodeBigIntToStackElement(BigInt(num)));
          return true;
      };
  }
  function opCodeToFunc(opCode) {
      const OP_CODE_FUNCTIONS = {
          0: genOpNumFunc(0),
          79: genOpNumFunc(-1),
          81: genOpNumFunc(1),
          82: genOpNumFunc(2),
          83: genOpNumFunc(3),
          84: genOpNumFunc(4),
          85: genOpNumFunc(5),
          86: genOpNumFunc(6),
          87: genOpNumFunc(7),
          88: genOpNumFunc(8),
          89: genOpNumFunc(9),
          90: genOpNumFunc(10),
          91: genOpNumFunc(11),
          92: genOpNumFunc(12),
          93: genOpNumFunc(13),
          94: genOpNumFunc(14),
          95: genOpNumFunc(15),
          96: genOpNumFunc(16),
          97: op_nop,
          99: op_if,
          100: op_notif,
          105: op_verify,
          106: op_return,
          // 107: op_toaltstack,
          // 108: op_fromaltstack,
          // 109: op_2drop,
          // 110: op_2dup,
          // 111: op_3dup,
          // 112: op_2over,
          // 113: op_2rot,
          // 114: op_2swap,
          // 115: op_ifdup,
          // 116: op_depth,
          // 117: op_drop,
          118: op_dup,
          // 119: op_nip,
          // 120: op_over,
          // 121: op_pick,
          // 122: op_roll,
          // 123: op_rot,
          // 124: op_swap,
          // 125: op_tuck,
          // 130: op_size,
          135: op_equal,
          136: op_equalverify,
          // 139: op_1add,
          // 140: op_1sub,
          // 143: op_negate,
          // 144: op_abs,
          // 145: op_not,
          // 146: op_0notequal,
          // 147: op_add,
          // 148: op_sub,
          // 154: op_booland,
          // 155: op_boolor,
          // 156: op_numequal,
          // 157: op_numequalverify,
          // 158: op_numnotequal,
          // 159: op_lessthan,
          // 160: op_greaterthan,
          // 161: op_lessthanorequal,
          // 162: op_greaterthanorequal,
          // 163: op_min,
          // 164: op_max,
          // 165: op_within,
          // 166: op_ripemd160,
          // 167: op_sha1,
          // 168: op_sha256,
          169: op_hash160,
          170: op_hash256,
          172: op_checksig,
          // 173: op_checksigverify,
          // 174: op_checkmultisig,
          // 175: op_checkmultisigverify,
          // 176: op_nop,
          // 177: op_checklocktimeverify,
          // 178: op_checksequenceverify,
          179: op_nop,
          180: op_nop,
          181: op_nop,
          182: op_nop,
          183: op_nop,
          184: op_nop,
          185: op_nop,
      };
      const func = OP_CODE_FUNCTIONS[opCode];
      if (func) {
          return func;
      }
      throw new Error(`Unknown op code: ${opCode}`);
  }
  // Implement all the opcode functions in this order starting with op_nop
  async function op_nop(ctx) {
      return true;
  }
  async function op_if(ctx) {
      throw new Error("Not implemented");
  }
  async function op_notif(ctx) {
      throw new Error("Not implemented");
  }
  async function op_verify(ctx) {
      if (ctx.stack.length < 1) {
          return false;
      }
      const value = ctx.stack.pop();
      if (decodeStackElementToBigInt(value) === 0n) {
          return false;
      }
      return true;
  }
  async function op_return(ctx) {
      return false;
  }
  async function op_dup(ctx) {
      if (ctx.stack.length < 1) {
          return false;
      }
      ctx.stack.push(ctx.stack[ctx.stack.length - 1]);
      return true;
  }
  async function op_hash160(ctx) {
      if (ctx.stack.length < 1) {
          return false;
      }
      const sha256 = await makeBytesObj(ctx.stack.pop()).sha256InUint8Array();
      const ripemd160InUint8Array = ripemd160(sha256);
      ctx.stack.push(BytesObj.fromUint8Array(ripemd160InUint8Array).toBytes());
      return true;
  }
  async function op_hash256(ctx) {
      if (ctx.stack.length < 1) {
          return false;
      }
      const sha256 = await makeBytesObj(ctx.stack.pop()).sha256InBytes();
      ctx.stack.push(sha256);
      return true;
  }
  async function op_equal(ctx) {
      if (ctx.stack.length < 2) {
          return false;
      }
      const a = ctx.stack.pop();
      const b = ctx.stack.pop();
      ctx.stack.push(JSON.stringify(a) === JSON.stringify(b) ? encodeBigIntToStackElement(1n) : encodeBigIntToStackElement(0n));
      return true;
  }
  async function op_equalverify(ctx) {
      return (await op_equal(ctx)) && (await op_verify(ctx));
  }
  async function op_checksig(ctx) {
      if (ctx.stack.length < 2) {
          return false;
      }
      const publicKeyBytes = ctx.stack.pop();
      // Remove the trailing 0x01, which is the sighash type.
      const sigBytes = ctx.stack.pop().slice(0, -1);
      let point;
      try {
          point = deserializeFromSecFormat(makeBytesObj(publicKeyBytes).toHexString());
      }
      catch (e) {
          console.log('Failed to deserialize public key: ', publicKeyBytes, e);
          return false;
      }
      let sig;
      try {
          sig = parseHexStringInDerToSignature(makeBytesObj(sigBytes).toHexString());
      }
      catch (e) {
          console.log('Failed to deserialize signature: ', sigBytes, e);
          return false;
      }
      const pubKey = new PublicKey(point);
      if (pubKey.verify(ctx.z, sig)) {
          ctx.stack.push(encodeBigIntToStackElement(1n));
      }
      else {
          ctx.stack.push(encodeBigIntToStackElement(0n));
      }
      return true;
  }

  function varIntToBytes(varInt) {
      if (varInt < 0xfd) {
          return BytesObj.fromSafeArray([varInt]).toArray();
      }
      else if (varInt <= 0xffff) {
          return BytesObj.fromSafeArray([0xfd, varInt & 0xff, (varInt >> 8) & 0xff]).toArray();
      }
      else if (varInt <= 0xffffffff) {
          return BytesObj.fromSafeArray([
              0xfe,
              varInt & 0xff,
              (varInt >> 8) & 0xff,
              (varInt >> 16) & 0xff,
              (varInt >> 24) & 0xff,
          ]).toArray();
      }
      else {
          throw new Error('varInt too big');
      }
  }
  function varIntFromBytesReaderToBigInt(reader) {
      const firstByte = reader.read(1)[0];
      let numBytesToRead = 0;
      if (firstByte < 0xfd) {
          return BigInt(firstByte);
      }
      else if (firstByte === 0xfd) {
          numBytesToRead = 2;
      }
      else if (firstByte === 0xfe) {
          numBytesToRead = 4;
      }
      else {
          throw new Error('varInt too big');
      }
      return makeBytesObj(reader.read(numBytesToRead)).toLittleEndianNum();
  }

  class Script {
      constructor(cmds = []) {
          this.cmds = cmds;
      }
      static parse(reader) {
          // TODO check if we can assume to length to be less than 2^32.
          const length = Number(varIntFromBytesReaderToBigInt(reader));
          const cmds = [];
          let count = 0;
          while (count < length) {
              const currentByte = reader.read(1)[0];
              count += 1;
              if (currentByte >= 1 && currentByte <= 75) {
                  cmds.push(reader.read(currentByte));
                  count += currentByte;
              }
              else if (currentByte === 76) {
                  const dataLength = reader.read(1)[0];
                  count += 1;
                  cmds.push(reader.read(dataLength));
                  count += dataLength;
              }
              else if (currentByte === 77) {
                  const dataLength = Number(BytesObj.fromBytes(reader.read(2)).toLittleEndianNum());
                  count += 2;
                  cmds.push(reader.read(dataLength));
                  count += dataLength;
              }
              else {
                  cmds.push(currentByte);
              }
          }
          if (count !== length) {
              throw `parsing script failed. count: ${count}, length: ${length}`;
          }
          return new Script(cmds);
      }
      rawSerializeToBytes() {
          const result = [];
          this.cmds.forEach(cmd => {
              if (isOpCode(cmd)) {
                  result.push(cmd);
              }
              else {
                  const length = cmd.length;
                  if (length <= 75) {
                      result.push(makeByte(length));
                  }
                  else if (length <= 0xff) {
                      // 76 is pushdata1
                      result.push(76, makeByte(length));
                  }
                  else if (length <= 520) {
                      // 77 is pushdata2; 520 is the max length of data allowed.
                      result.push(77, ...BytesObj.fromLittleEndianNum(BigInt(length), 2).toArray());
                  }
                  else {
                      throw 'The data command is too long';
                  }
                  result.push(...cmd);
              }
          });
          return result;
      }
      serializeToBytes() {
          const raw = this.rawSerializeToBytes();
          const total = raw.length;
          return [...varIntToBytes(total), ...raw];
      }
      async evaluate(z) {
          const clonedCmds = JSON.parse(JSON.stringify(this.cmds));
          const stack = [];
          const altStack = [];
          while (true) {
              // cmds is the reverse of a stack, where we pop from the beginning, hence the shift.
              const cmd = clonedCmds.shift();
              if (cmd === undefined) {
                  break;
              }
              if (isData(cmd)) {
                  stack.push(cmd);
                  continue;
              }
              // cmd is an OpCode
              const opFunc = opCodeToFunc(cmd);
              const success = await opFunc(new OpContext(stack, altStack, clonedCmds, z));
              if (!success) {
                  console.log(`Script evaluation failed. cmd, stack, altStack, cmds, clonedCmds, z:`, cmd, stack, altStack, this.cmds, clonedCmds, z);
                  return false;
              }
          }
          const topElt = stack.pop();
          if (topElt === undefined || BytesObj.fromBytes(topElt).toBigEndianNum() === 0n) {
              return false;
          }
          return true;
      }
      add(other) {
          return new Script([...this.cmds, ...other.cmds]);
      }
  }

  class Transaction {
      constructor(version, inputs, outputs, locktime, testnet = false) {
          this.version = version;
          this.inputs = inputs;
          this.outputs = outputs;
          this.locktime = locktime;
          this.testnet = testnet;
      }
      static parse(reader, testnet = false) {
          const version = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
          const numInputs = varIntFromBytesReaderToBigInt(reader);
          const inputs = [];
          for (let i = 0; i < numInputs; i++) {
              inputs.push(Input.parse(reader));
          }
          const numOutputs = varIntFromBytesReaderToBigInt(reader);
          const outputs = [];
          for (let i = 0; i < numOutputs; i++) {
              outputs.push(Output.parse(reader));
          }
          const locktime = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
          return new Transaction(version, inputs, outputs, locktime, testnet);
      }
      static parseHexString(hex, testnet = false) {
          const bytes = BytesObj.fromHexString(hex).toBytes();
          if (bytes[4] !== 0) {
              return Transaction.parse(new BytesReader(bytes), testnet);
          }
          const splicedBytes = bytes.slice(0, 4).concat(bytes.slice(6));
          const transaction = Transaction.parse(new BytesReader(splicedBytes), testnet);
          transaction.locktime = Number(BytesObj.fromBytes(splicedBytes.slice(splicedBytes.length - 4)).toBigEndianNum());
          return transaction;
      }
      serializeToBytes() {
          const results = [
              BytesObj.fromLittleEndianNum(BigInt(this.version), 4).toBytes(),
              varIntToBytes(this.inputs.length),
          ];
          for (const input of this.inputs) {
              results.push(input.serializeToBytes());
          }
          results.push(varIntToBytes(this.outputs.length));
          for (const output of this.outputs) {
              results.push(output.serializeToBytes());
          }
          results.push(BytesObj.fromLittleEndianNum(BigInt(this.locktime), 4).toBytes());
          return results.flat();
      }
      async hash() {
          const sha256 = await BytesObj.fromBytes(this.serializeToBytes()).sha256InBytes();
          return sha256.reverse();
      }
      async id() {
          const hash = await this.hash();
          return BytesObj.fromBytes(hash).toHexString();
      }
  }
  class Input {
      constructor(prevTx, prevTxIndex, scriptSig = new Script(), sequence = 0xffffffff) {
          this.prevTx = prevTx;
          this.prevTxIndex = prevTxIndex;
          this.scriptSig = scriptSig;
          this.sequence = sequence;
      }
      static parse(reader) {
          const prevTx = reader.read(32).reverse();
          const prevTxIndex = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
          const scriptSig = Script.parse(reader);
          const sequence = Number(BytesObj.fromBytes(reader.read(4)).toLittleEndianNum());
          return new Input(prevTx, prevTxIndex, scriptSig, sequence);
      }
      serializeToBytes() {
          const results = [
              // Clone prevTx because reverse() mutates the array.
              this.prevTx.slice().reverse(),
              BytesObj.fromLittleEndianNum(BigInt(this.prevTxIndex), 4).toBytes(),
              this.scriptSig.serializeToBytes(),
              BytesObj.fromLittleEndianNum(BigInt(this.sequence), 4).toBytes(),
          ];
          return results.flat();
      }
  }
  class Output {
      constructor(amount, scriptPubKey) {
          this.amount = amount;
          this.scriptPubKey = scriptPubKey;
      }
      static parse(reader) {
          const amount = BytesObj.fromBytes(reader.read(8)).toLittleEndianNum();
          const scriptPubKey = Script.parse(reader);
          return new Output(amount, scriptPubKey);
      }
      serializeToBytes() {
          const results = [
              BytesObj.fromLittleEndianNum(this.amount, 8).toBytes(),
              this.scriptPubKey.serializeToBytes(),
          ];
          return results.flat();
      }
  }

  const SIGNHASH_ALL = 1;
  // TODO find a valid tx id to test this.
  function getUrl(testnet = false) {
      // return testnet ? "https://testnet.blockchain.info/rawtx/" : "https://blockchain.info/rawtx/";
      // return testnet ? "https://testnet.blockexplorer.com/api/tx/" : "https://blockexplorer.com/api/tx/";
      return testnet ? "http://testnet.programmingbitcoin.com" : "http://mainnet.programmingbitcoin.com";
      // return testnet ? 'https://api.blockcypher.com/v1/btc/test3/txs/' : 'https://api.blockcypher.com/v1/btc/main/txs/';
  }
  class TransactionFetcher {
      // cache is currently just used for testing.
      constructor(cache = new Map()) {
          this.cache = cache;
      }
      static fromStringMap(map) {
          const cache = new Map();
          for (const [id, hexString] of map) {
              const transaction = Transaction.parseHexString(hexString);
              cache.set(id, transaction);
          }
          return new TransactionFetcher(cache);
      }
      async fetchTransaction(id, testnet = false) {
          const possTx = this.cache.get(id);
          if (possTx) {
              return possTx;
          }
          const url = `${getUrl(testnet)}/tx/${id}.hex`;
          const response = await fetch(url);
          const hexString = await response.text();
          const transaction = Transaction.parseHexString(hexString, testnet);
          const txId = await transaction.id();
          if (txId !== id) {
              throw new Error(`requested transaction id: ${id}, received id: ${txId}`);
          }
          return transaction;
      }
      async getInputValue(input, testnet = false) {
          const tx = await this.fetchTransaction(BytesObj.fromBytes(input.prevTx).toHexString(), testnet);
          return tx.outputs[input.prevTxIndex].amount;
      }
      async getInputScriptPubKey(input, testnet = false) {
          const tx = await this.fetchTransaction(BytesObj.fromBytes(input.prevTx).toHexString(), testnet);
          return tx.outputs[input.prevTxIndex].scriptPubKey;
      }
      async getTransactionFee(transaction) {
          let inputSum = 0n;
          let outputSum = 0n;
          for (const input of transaction.inputs) {
              inputSum += await this.getInputValue(input, transaction.testnet);
          }
          for (const output of transaction.outputs) {
              outputSum += output.amount;
          }
          return inputSum - outputSum;
      }
      // Returns the integer representation of the hash that needs to get signed.
      async getTransactionSigHash(transaction, inputIndex) {
          const serial = BytesObj.fromLittleEndianNum(BigInt(transaction.version), 4).toBytes();
          serial.push(...varIntToBytes(transaction.inputs.length));
          // loop through each input using enumerate, so we have the input index
          for (const [i, input] of transaction.inputs.entries()) {
              let scriptSig = new Script();
              if (i === inputIndex) {
                  // the previous tx's ScriptPubkey is the ScriptSig
                  scriptSig = await this.getInputScriptPubKey(input, transaction.testnet);
              }
              const txIn = new Input(input.prevTx, input.prevTxIndex, scriptSig, input.sequence);
              serial.push(...txIn.serializeToBytes());
          }
          // Outputs
          serial.push(...varIntToBytes(transaction.outputs.length));
          for (const output of transaction.outputs) {
              serial.push(...output.serializeToBytes());
          }
          // Locktime
          serial.push(...BytesObj.fromLittleEndianNum(BigInt(transaction.locktime), 4).toBytes());
          // SIGHASH_ALL; TODO see if we need to refactor this out as a constant.
          serial.push(...BytesObj.fromLittleEndianNum(BigInt(SIGNHASH_ALL), 4).toBytes());
          // hash256 the serialization
          const hashInByteObj = await (await BytesObj.fromBytes(serial).sha256()).sha256();
          return hashInByteObj.toBigEndianNum();
      }
      // Returns whether the input has a valid signature
      async verifyInput(transaction, inputIndex) {
          const input = transaction.inputs[inputIndex];
          const scriptPubKey = await this.getInputScriptPubKey(input, transaction.testnet);
          const z = await this.getTransactionSigHash(transaction, inputIndex);
          const combined = input.scriptSig.add(scriptPubKey);
          return combined.evaluate(z);
      }
      // Returns whether all inputs have valid signatures
      async verifyTransaction(transaction) {
          if ((await this.getTransactionFee(transaction)) < 0n) {
              return false;
          }
          for (let i = 0; i < transaction.inputs.length; i++) {
              if (!await this.verifyInput(transaction, i)) {
                  return false;
              }
          }
          return true;
      }
      // Modify the transaction in place to sign the input at inputIndex with privateKey
      async signInput(transaction, inputIndex, privateKey) {
          const input = transaction.inputs[inputIndex];
          const z = await this.getTransactionSigHash(transaction, inputIndex);
          const der = (await privateKey.sign(z)).getDerBytes();
          const sig = der.concat(BytesObj.fromBigEndianNum(BigInt(SIGNHASH_ALL)).toBytes());
          const compressedSec = BytesObj.fromHexString(serializeInCompressedSecFormat(privateKey.publicKey.point)).toBytes();
          const scriptSig = new Script([sig, compressedSec]);
          // change input's script_sig to new script
          input.scriptSig = scriptSig;
          return this.verifyTransaction(transaction);
      }
  }

  // @ts-ignore
  const txCache = {
      "0d6fe5213c0b3291f208cba8bfb59b7476dffacc4e5cb66f6eb20a080843a299": "0100000001c847414138fc4e86c97bce0adfe0180d8716d0db7f43b955ebb7a80f3cbc2500000000006a47304402202f7e26dda5a70179eaa51e7a995b2fb6b3a705c59c792ae1fde3a4f4a58adaf60220406672081f8f2acfdfbeb327a5c618beb66ab226111da48ac9b150dad0d0ae52012103935581e52c354cd2f484fe8ed83af7a3097005b2f9c60bff71d35bd795f54b67ffffffff0e404b4c00000000001976a91477d946a68a9b95e851afa57006cf2d0c15ae8b3d88ac404b4c00000000001976a914325371fe093e259bdc7beca2c31f795e1b492b2088ac404b4c00000000001976a9144ccf8be232f0b1ee450a5edcc83cc4966703531388ac404b4c00000000001976a9146fe7d8cea1a39739508db7070b029d8497a0d85288ac404b4c00000000001976a91427813ea0d6e3439ffa3e30e47cd768c45bd27ab888ac404b4c00000000001976a914c16ac1981a4c73f1d51cc28f53d4757d3673a45c88ac404b4c00000000001976a9143a1806b04b0f3e14ab9b7c8cb045175d14014ac188ac404b4c00000000001976a914af39e20d8f115ecdbb3b96cda2710239e9259c5288ac404b4c00000000001976a914047357aff1cb49f6a26d71e48b88c1ba7c6ce92788ac404b4c00000000001976a9149637bebfa095f176b6cbffc79cec55fb55bf14de88ac404b4c00000000001976a9142dffa6b5f8ba2bf1ab487d1be1af9d9695350a4b88ac404b4c00000000001976a914fcf0cb53dccea9e4125a8472b8606e7f1769dad388ac404b4c00000000001976a9145a8398af0353464cf727d57a1dd79807eee50b1288ac00639f02000000001976a914d52ad7ca9b3d096a38e752c2018e6fbc40cdf26f88ac00000000",
      "184d3393cea44574a7b521575878a5485fc3c18e4920808235c8f58264c1dc48": "0100000001e047a4dfa9980e1533ef990f25ccd387922b2f9b8ed00df064684ff33b3fe52e000000006a473044022007fefcd11b9b715b45ecfe02eba011d785a9364c08af60297d6aa8a4ccc95c3702201cac5e121d07545275b510264c625d9cdaf9e4b58652aad0226a47c96729dc270121021f955d36390a38361530fb3724a835f4f504049492224a028fb0ab8c063511a7ffffffff02c0441105000000001976a914d23541bd04c58a1265e78be912e63b2557fb439088aca0860100000000001976a91456d95dc3f2414a210efb7188d287bff487df96c688ac00000000",
      "22874d30bde689475e1df03608aa85a3c7b01e18f8d53aedc1b6df6ded788286": "010000006742b26669c333bd97f72f11778f1019f6cd9d2dcb2135f591a2545b80225bcbe8180000008b483045022100f2f822fa6a31e4bac9ef780f3a5f584688172e5eeb595f59225e222aebf781fe022003c8dbf4d948cda1b738b707b989014d890f4ee8d775f10b1c3f5bf4a0b80b1d0141046a11580e919a254797f72a42c52777fef4f7a2e0dbee4eabbb5790c52427f0986cdfe390b11d12a79f072389d37fb753222b23c5ccda336995b22de7733b60baffffffffe016810865d233cf38e30a20c1dc8d2012ca99b18e96aad397d0966a31999c12630000008a4730440220271308a8a5a4933a31915ee42f86fa233612f645cf8d455b8924a3cd03baeb8402201c42f5c437a31af64041949228e761e780ac24acf5bdbf161df02fc7ac2fc0b20141046a11580e919a254797f72a42c52777fef4f7a2e0dbee4eabbb5790c52427f0986cdfe390b11d12a79f072389d37fb753222b23c5ccda336995b22de7733b60baffffffff3bdc8821f0148d633e8c47a0dd69930eebc6ba207f1fcc2a0104e5ef347f58b7010000006a47304402200f9ff1d823bb92ac8d95cf9df6e79b049543d24a59d5d353714113740811815102204bde4eb263464ff2726817591b4f2bf89a24250da49ab7151953a49c686c9546012103a9e840a0d665acf8c99c9523c8620085ac6056ae702d73567e9f24df976b66beffffffff81cc05d144e4caecd27e89534c6d8e05fd0c78b4d3d207acecd9506cb69439f0010000006a47304402202772886a11782ab6752537874a95c9906ef3dff91e5c9af8ee3f33b23187ee950220187e4540607ce4b814def03df4e282a6b88ad5453e8f6c29d606668df624c13301210256acfed47f1ab7f5d8b2503a670304c3af7d45eb9239a6d7514a3a2826059c47ffffffff43ada4bfc1da0b651cd1e72d3e72c68a312de1d1f2b3c22284ad0c7ccf2847a0000000006b483045022100f819670901b1be7af00839fad2d427f37b7900aa705f1ff69cd95ba1001aac4702203bb7ab165d007f7071e5af6ed0b8c4ecde0624a2646136cfb375b1f31cbcd82d01210265f18314bc06002888ead132161075189d24781729267095d52a6d3689a19804ffffffffb0774513840d490cd4acd84e70370efaaa57945807345ee0c405b592d066f97b010000006a47304402204d980d1575ad44580a200c75485cc0a7707d8998b66c6de0271fd0d3b5097f23022038efaa5057528a634cedd6f0cb6323d656ad834e8588704f3c92682f837144e4012103a1d2663239a1cfa310f2606f6c8770925f1a5acf65e187625b43f1dc6693a88fffffffffc5719dc896c06ad855239f24c4351b3f2c853e2b79db3b7aeb1a255269e9f476000000006a47304402202c18092176cddef515187c183eed279aa7c5bf292e61378e9aee7e5a5c5c43ed02206a29b8bcfbf99a4bb5e147aa3549628cb511af6bcea696fb30fae0d716a0e1f401210284be3bcc6964739a85800e895c45e7b2328ec125f6730afe9e150251e766c833ffffffff1e781d7b74362089297c3ff128f2d5460d7b1b61305df45ceae40c64ab3ba9f7000000006a473044022005e988888dfe0678a06d8c3ede68320c773ff433e15bb80f37ef801e1a24d2d6022009c5983b1f02167a47439af180eb5a1fb335a4d21e7b11aaae4dd3c8b324fbb301210330a9ad0858a79805b38810119f86bde43e9f668afd96b8018f55c7ea1e8822a6ffffffffddbfa6d357705ec2eda7c800b915e8ce41daec41f1d5fc3cc0a3159b2e4712d9050000006a473044022010b1eb158063112e8756633d148f145b301fe05710bff89fa4722019595c3aea022007be956ff43aa4fc836bac68085160b0b5a8faa8d3007f2a46cb9d11f227601701210203a27a2b766b2e43fcbd1a5d7f610200b4b03e2ec4e911bdc6874e1110f8d1d3ffffffff387aebc24c2e25d220b563441812636fc9b09a0383fda0f83ca4c8e2bbf6935d000000006b483045022100facb2e842ae274df8e42d56f07d3cfab7f0cde4e0db26e26dd769e8f0c8f3f66022054d2f5d60b66ed4835eb189574f90d39fed6a8f9a4ba4e02187828f51ca8d33f0121039d51803c58a61fced27f27050e5ce53487ad8678788ddb5d05f27a488dfbf0b3ffffffff8ff71cb1be21e08bbe7b24f99718f5b56144dd20ef30f6d5a153ac67f026a706010000006a47304402206a7458056d6bb474dcf92f8d4f2a23e82b93e06ca440db05b1caa3a7bfe2c83d022071cb81b7dce404decbeeb1ecce2ee54f5325c60190cbcebeb7df2b1be576435301210239ed038f1115c08e9e596a26a3a564c00b6ae8de6434c1fee14789faaae161e0ffffffff811bd9c890f5e7e7281ef8caa4333921540331f90fbda58a975f700ba1019594000000006b483045022100f0502584045c9c1edc33ca706c5db90d0f2b680223e50b3d1207eb87fc7335bc022021d0e0cd19db31193d001946a9ea731d3b35746d2268142a3783a89a85914f030121022f6132653484b5925be6ea1fbea6f3bcd9dc80730bafabfd7cc342e257096f7cffffffff52b5d1ec49a79f5434ce1d2a1bbea47345033cedf815a5789da72486ca88cfa4000000006b4830450221008e71abdd5957625395ed7ae176ee98519fce969f8f6aca7c438609109781fab302200c514aa56fa55da06d142fca7ae5b7d8017e7b89b3cec4a438a88f30c5b9c9eb012102db44c9a300130819ab430ab805d0e43c9cdfc534c6f55aedfe8fcea4e297ad1effffffff9dd499d895ea8e6edea8c441eb516ea2f120d72184a46ed746da76c8ec55df8a000000006a47304402207555689d6056f3f15f827f84cfc5f393f7164eae4b88c65d20adff8c5efc0edd022027d20b103c11c9c0c90d8625ca88829c7bdc9731d7ac7859307debae6ebe11d60121038ae16e7b24d6c8428a11be4d9869dcf0117121d0a7d5b4f3e29c3b6e9c04b055ffffffff3e04c75c9f8344ca53c8ecc56837d82933c21cacc37e2a0443f757090104c00d450000006b483045022100bd433516b20c92287f7449bad14934710917f47936b29232e11cb60c60f558320220150dcd6a998aad51c5e564982611f851bf62b7d8d8b206e8f0368ff11c9a05a9012102c97358b40e9bb4ceff6b7d30449159584ca8db03cdd25ed91820a3946ca75463ffffffff1394c72064fd2b24fd64937669fc5e2557ca914bc58572c65d35bd01219cb69c000000006b483045022100a23b5b0c359df70b1e352f1788e9f8536e7d067e0e2cad168dcb57fa35e1820a02206ea925ecaac44030d00052b3b9e864b01855778c58f40ce78ef195a7fbe22c200121038c5f9cbe94843091a27a989ffb2c473d421d12c2745f506bd1283c5dd84683e0ffffffff699fd7ed1a0894f0689a407f545d2634c27b03331d03ad9e6888d787ff93d692000000006b483045022100da8cd60c31baf2530e324942e5a8810d56a5aa7942fe81ef587aa7c05d3f5a970220614b7fad2740bc0738b866ac0699bb60bf986f79f97fc143581e3eb1a198c13d012103a801115daaa9598d0efd2bfd68658f9d537e95dae30ef8f337ca4633537e4615ffffffff3e04c75c9f8344ca53c8ecc56837d82933c21cacc37e2a0443f757090104c00d530000006a47304402203323cfe74e0256a36287969c8ae7daa8473327113b7a1b66d12a30c78c520bf0022061b01b6758c54ebcca621ef979d3b053665ec171729fe358e26ba92a455dbcb6012103cc504132cd4f4d5118341a63a451858391a13e8c94f4eea1125fc0f9c7d7d201ffffffff9df90b9ec009574191013c21663edd80d90135efdb4eea2cd5183a8e95414602000000006a473044022043730181d5196c891b6b4638dfff67f856b9bb4f18c35c7d10998ea694a62b4802200a496a7730dc1ad43251135cca3b329e48e3bee76cc956dbb2fe6873feafaf1a012103f01b545246d6ae6e8b78966ddbc33ef40e392b1099643bf893b91cb0645736d8ffffffff58ca6197493805cd290bbbbe6db97a3686ccb1efce0b848d7589e0f13ab961c9010000006a47304402205359585157057062a0eb163ceb54e54a2d2654089ba30397d59a386e3709c18702203f7b414480abe99a3115900f2fb1a2c4e6b1dcded931bb72fa7871461aea3344012102193448e4f4a188d6eff4f5a2b1c3ee71e6817eac17540166bf36a9bb854f5b69ffffffff19f30e071b2ca67a6dc67fa1d5bfbfb230585ef1066ce1075a2c05db9e75b675000000006a4730440220345e00ddd3f8978750d534f87f5ea6c6a4b71a26fed700a469377dee83079faf022074b9597862c3cd0c15269eed13372acdf8fe24b8924d21a73fc6b1f5d88d910b0121020897b151652659a2bc22c953771d16cba21cafa8049651e2e667d94ee2f45943ffffffffbab9411e040cf27ce000557794afba2d5d09b2d9c3303b5986bbfce6e58b3c2f000000006a473044022051974f3dbba6aadb1e1505de4fc728601ff62c7e406a5180f088217c428f8d6402200a58412b9edcdbf1941ee6ed7f8c38f1ace76a3cff1b8ae138209cd247207c090121028f7aa7c9773b9c23347a5cbc660fa6886a2b5a3205441d5db70052caf1d19405ffffffffd04aab28ef0f21e1a3c0444d3cff542eb3816405bcba8635c46757697f3f054b000000006b483045022100ba45aa1580c2a17e6a97f250ed700945cc6a93d6ed74574a5d258253eadc648b022030708d8927b042b9e377d1aab0bf9903721b2d98ab9b5e9090c88fe2bce3c21b012102eb53224ec2d01372c53c883bcf960ae404c9a9aa9250a3eb3e958f45ef181ac6ffffffff034d99808bbd74efe70127887b80f1e343b55906a29d39240351bd73c8db6d52000000006b483045022100fce17682f28f7697de470939dcb355111f89913ad354aa56474fe4cb737c058302200d80b0a30b339b434027d6bfb26f99784420830b36d121e6be3de65f803ab8ab012102d2572dd9811ca0ad5fb88ca49371213f0bba2ae2cd481dd3880f8f80d37a63a8fffffffffb5764e0f67e7a68743b3f457b1a89cfe7c438ca082efe03a89432fc2b0c6d45000000006a47304402202e752f8e4ba95a38b165f0c6a0505f8a8b783966918f851b274662a471f1a79c02203aa2645c366d3f7cf5af1ef3daabf0026dcd841cf3d89120e0113ff3fa7df80101210239026a28727d11896971fb773f0ec2e347f5b37d508266a8eacb14701ac92337ffffffff63b303f965834357495b550c23eeb0c3b0b6440d42e718b57ca697de1906145d010000006b483045022100cddca47365053f31924c1ec9bf14271defc3e9faf25d60072a88730f79048be102206e61468e5e0412e94a18dcbb06cfa0a7b33e258b5adddeb0147d057b5bb1f1fc012103746a32643522a6104563144202a0aedd433345104de3df1bc8245ab68325777bffffffffc6a517b1e7f4897c3fc4777628a3320c072f51975f65a686a7d626fa7d3b2ffa000000006a47304402200abcfff3a1c8cb50b7a94ff17406c5849e8f63255e87a9a2b3882982c57fd5610220789bee47c629604033e419d7db2183eeff030331551c4a32e01b4559ccaa6ac40121034a3b3d051f49d3929be628c790971b8072bac5c801df904a6baa049522e7e813ffffffff51b73f7e253566756d5549853291e51a433f90cb523e86c8fde1794c2762aec8010000006a473044022052f2306b425532a7cc9dbeb4779718ae37c987bcbaac85fecdd7eafd45d4ba3a02200dc89ab5e9db059a3dddb196c707f5e185de2c2d9733ff33201ad9d33fd3838e012103b4dddb331113447f9e89b991d8f32faaa5b1928d4f1b3cee5b2f3d9878ddbd0cffffffff5744ba4e4b0754b44dfe3121a22fb720063ea62d3a7f4d57ca5a79434619b0fc010000006a47304402202c118cb35199362d9db6a1eb7fa38b05a1fca1fae95b3805caf6805d5ffbb486022047788002a210f3967be9675a9f1c55edabf5777d32bca461a2a833ceed8f31fb0121024246b9df501c39dac5e0ac9cd0c4b3b0a1e7058c199db697410dc8af583e1c04ffffffffeba3ebff1b3caa1ecd4ddf6b137423d5dea4ba4a57eac16369c2033a96ccfd54000000006a4730440220647e236bb1d08ce0e9a6098f9fd84e5f0b6b82917277b0ad369db84002c4739b02200a5183b15e2cba14f4ab24e08f49cdcdefdb68ee6c2834b15fd7c796fa201a0a012102a4bb30e93bc606ce5671fba785274f4a90c446c85f143da4f37b91058ec10410ffffffffd5393c73bdc6c5b06339428ca5b2ccdd51957882b94cb7f4fb2cfac70d89a7fe000000006b483045022100b53baf3b74f02c74f525746c80b73f28e28d01cae74c5f03cbc83812e042e9a30220263e695e2285707b4feb292197a567cba4b4709bee5e1f8cae7bb4876d69d0920121039444e9a729111fc6596852bc03914851673d98edf16a8692c84fba4d69d23776ffffffff005f9f97095dbe5cdc63dbe1b1f59689ed2f462e99de831a4163006e8ce9c6ce010000006b483045022100ae9a443308235c249b9e9d8380f1622f08aa297351c051104f09f4e01d3cb74802202497a807687eed232cab91e9abd740e05f1dcbd0c20626adaf7220a1700fffb501210374a9e256d12465a5329d6bcc37570d6b4281ec48cc66294b1c6fc1596bf9ee2dffffffff9331530146ca360b161c4c7f9dd95582ff7e279502d38934dc13f035d9a0679c000000006a473044022068c5e2f8ce577d23b84723686cc8ab01f00a336c6ddc19f45d3cf18b1343ffcc0220508e3e9aefec6f62498ab9dd7f8f4ce1dd6b24bff3cc951d741d69485b159fd3012102d3c44b96552e77d31928b4d065f45e4fced41b2bfaba79b7196d0dd332be148effffffffff149c70aeecaeeddc444d30160ca4af41c012df1b1f1be03599c482f995fa7a010000006b483045022100e8beb2a63d7ac745afd287cce273b845cbdd9ffc039ef815c6da0030b277efc60220475d2f0a2234373c24dd866dde2219e221421ec106a48ae1a12fd1666239d51e012103c343aad7f0e4c4ea2edb738ea9c46fd9cc3a0d284ce9ae2891c5dac3cbae7770ffffffff1608358dfba1a114ad0b4c809be7c032675d48b66d1f507095a0cde0616d33ad000000006b483045022100ccb874edfd919c5b3e3166db2f48d660d7cdcd7f6c10ca890926a2910ff36617022037fcaa7999eab94e36c33250b1248ec2d5e379e6cfd28a7bf0b77e0d6d7c856e0121032d814e3d84aca15f44be0eb4f63e1149a72734b2797ed87d6296b258b267afdeffffffff567460ed400f0ab906d9d8e2f288b3a977e52ab16e22cc038227cc61be25315a020000006a47304402204f73eae9d7341ff627f0b7b2dc5afd0580a2bf9bd00c666a2500bdd2b361bc5d02202c5ecc70ad6f942f4a06129c9bdfc40627f214d35fe72d6c15352aee0b0e3e58012103e7b097035863a58f979961b8f512747e0bfbe18d231c8c4f3292cf4c6c78e32fffffffffc9293373c4b7e6f53bf8d9116e7dc04ac59751c5ad1dcc5c2a8ddd0389116d5c000000006b48304502210087180aa592cfde363e879c446b8a01ac5f74d6caa556f813b0bfac62b783c21e02202857c50b0ee7cf68293b398b9fe9d7aa783b52c0455d5901d92224d3ec05d2580121025a4f5976172f271ff54e489b7d0b3e68bccfacb392a3f1788477f2fcb28e4906ffffffff8abca7bf0dbc7741e640444d1ac3935f339b542ceeb89e88892c2f30c0a94fc6010000006a4730440220061beb8135e9cb181e62087ae81a28286e5dd9dea68bb78db014adec0bd56c9f02204d519f28c7cb52a9611694e4dc855799863cec4d636b210a24c48e18e57705050121036d7c8541143c55ee0e70cfb608c4fae22ffc07b7e1fe65c0f58cf71797abccbeffffffff415d9f40dd0e5681cfb87eb87e0f236284480ba61d8c1e9de6fc841cf62e8f1d010000006a4730440220515c9aa5ef7a6df72c7f78e32e1f63c0a375408ee39c92924b476cc698358797022057fbe7c705c9a4c1b5875f92ee785447644e1d349ce5d802fa83c8517b8fabb0012102f5a86d0f1078c0338475055c382c8bb4fc14ed1ae0be8e67e845027a61340113fffffffffe387bb9bef71ce6279043923ca254f860f93edc2aa2e5de3c62518f0d18677d000000006b483045022100cc0e41e7cfa1b2fc5e98441ceca0abc7f6ee97d7da4c11c5e39d6fc269e18ab6022011d944b4bb24388211d8a5fe77a919da4505954fe087e4dfa506a0eda2ced5f90121037b3e43bf5af13e3f32d9b164a938274c3e295693e3dd447cf1edf1a1d90d9cc1ffffffff18b93da93c327cd1d3d687b717e0ba082c99e3a2f83aa39f67318d17cbb2510c010000006b483045022100faab20f9b9e5f2933577ea7802890fbb44d24f0863415d624a6ed3746256048b022025f7cf50e65d9b556727ca2c1701b4ca9bd43e91e568febb09cb073e2ef3909701210315611721e4c9aac91dd67dcd3038eef33d4ed40e6bb0de648f7ef2a89fc69a66ffffffff5fe58f83bd25dbab875fa66bbaf53140321e2597ee15ad111b8855772d90baef000000006a4730440220697ee65fb1e4a152fb0954f9baa3526117f6cf24cc7bc852069b1dc7b09922b802203a6a42f378f258005408db9dee2130c7c80dab53f4c9609ca660ba4b70026e78012103966e2d4661ff824bebe93ccd11c8e4505039c96a6a244819947bd6dea00f9285fffffffff7c400b6b3ac7cf2292c193f192eb42c7e4cd5364b2ac5bddce11447905e8dc8000000006a47304402207ca55705d80e1b42f195d2fb8cf81bd8f097c543361738d8815d9c8982e75176022015898f4314c5d5f28b2663d9437bef655f26d07948e3e68c7078a733f51e81e1012102b1546f50cf93b8af07bc0a7224f3d2442d0e0ad9771365caec01f7cc4ab64835ffffffff79dac25171ae88e5e852f6c9175c02d393573b7cf1735d1cb9debaa5577a66a9000000006a4730440220568c04766d7eef42570ba66e2747e6a8eb8c767f2d9f08e03077ed70891f5c00022001db0acbc0ae7f933e34fb1fdebe562aeae70523852be0f11e43ae7159b7723a01210386f4bce789560692201f790beb71c2bc6496121b2a9240e704b441f949a1f41effffffffd52d15727ad1cb076ae814a3a31b6515955678975b66b8aeebee472bd5650535000000006b483045022100dbeeb5c49168aa9d708a35dc36e1733102172ff65a687fd4c404a2dcaeb995a602206c3991886d5e7d39bad4f6df4e539fbc23e59afdba20a80dae7e6e78ce16039a012102fa632baa48fee0cba7278e3bf1d9aceca67ee2e0521c2d6a3cb6ab533b2760f5fffffffff4c5f7856207a3bc231ca244cc64b14f7617ffe3604d169123fa374bed076bee010000006b483045022100c273ca5ae14bb39cb7a62c661443ffb26b7a6e40450476e1f631a35885b8859c0220438ba55a3c19e5b3ed9e3ad213f9dc0b203c424c1c71d53ee008733d127e3bcb012102fd5955293051ce1d1eed94f20278e6c8b241c731ba21c5913f34593715c901b6ffffffffd3c91971383638b574c7b4c78fc79e70b13041e894bf7338df334f53b3333509000000006b483045022100a1814c6c7ebc3425c7aa143053c42d27f46b1cc1c0e839890533750d016e899d0220380e5bf7cfb8b3b4187f63229d7d4a9c22f12fd5db39488959cd231a4c01e52a012103acd230661fcaf894670c072bf01a8abec27d0a657b956cdb29a4d6e4bdb66032ffffffffb015015335107e73b7c3a957fcd45ee8bf037e5a5d42a02df5bf87aa87b533d0000000006b483045022100e31561d31fa640564063b0e6ebbf1a3e15780454c233475982ea5d56317037e5022055723e9be084801938e5f376976bb8e233a483e8617f62146d3fc8f36abab961012102e620a6ee63e69affb4310686d8922908502a77f8c0789da01a8d5429370fe64affffffff488080833c56c5bead277947174932a004495f2331d167845cad498e4f03657e010000006a473044022048f78a8a16b8f1072ac8bb043a05e29e2ce2a892201fdfe4d335d620d34858ce02201263eb83a4c891e660cfbc6dac3ad9eece473d768b8c882cf2e06a56c4f4d84a012103939896547d26a0999ff4f45766a15225f6b63aeb6f924924b42683e7e8fdd694ffffffff93f2946255bd8334cc4eaee62843354fb17aa42057e37615867b0ca8aca47ff2000000006b4830450221009251b6bd44e2183a722037fb42691e3d8885323545c8830ae6451520f89c5513022036e53587159489b8e9d48aa14e0f3c0fe72da4d64b939ebf8d2e51ebdce5c6660121028382bc2e80f9b9fe535ef2bb1ec76f41dd18790ca01a8245d307a91395a1382cffffffff809ea229521093cc72dfbfcbbcbe8ea7b4892f4a4fde72877f0a401e1de7ca2c000000006a47304402206ee5c70fa817d12c7c52ee21ad150a8d6420853a73ab32e43b070348729cf31d022047904dedd2925cb3de61846355e4d45b19f966510ef7f10095df78b8d0de43130121031fb640ef11e196b26b0abed3c0c7c310fedd61658bef4f594df59562ca3ee20bffffffffcdfb1b63d490a4d3ef7f9dc02dea9bd801d08822e75d1fb00aea53b9fd79a508010000006a47304402207c3ff5211c874775d4d413a5b17b3c6c7ff928dd63933320a8740bd3bd86b606022070312bf375105a95895dcea4dfd05077103983eb48c26a3907449a4b5786a44e0121020bd5088a1defa95628dda04d169da1ce51bf68cf07f2a9c2cf6cc2a0d51f82d2ffffffff3cebd6e363912148d87361a69951fdb9c44fcf22d5e22669e7dadc8160911e82000000006a47304402202b358536b21ca532774e1fe66f0205a534277cb766d1244e5eae277fb4e7fab70220398eac885de34e190cdafdc306630f187da8fef8a2b3e464cea12391e85aa860012103cf3fc44260004215dd1d6f6032fc7763aeaf37f535f795c7decbb7c47cb8ab68ffffffff15c42612434fab2db434ff03276f78fa26d1f8e7f1719111a4841b2edb984770010000006a473044022052e886d14ad14616e17f0a948d0ffc9989c669554aae7af2a4bba505e9440a73022065ae07849496f5e04d728f910d6cd41d50ca7d08e6822488cd08bac7c928bfdd012102d0813eaa02e23fc73f78a0f4b2138f06a271b4221b1ee6c966f10bea98d34dc9ffffffffde65f73189261ec9e0fd9c32bc8319e9a06f8e06b126c24ae4671ff8b01e1902000000006b483045022100af7344a6896562f4df30da3598dc55b0a12199f97037b1328568fecb812d308502206b97d5bd9ea6f7b934db04788b5557c784322ae9ca7090732d8256f5ee5549c801210353b78d85dbe12db56184199a169301f44c1dced0d97065d415b83924159bb8d5ffffffff32099af5c2573220eaffab19be4b67ffb754c2b4926d766caa5d573f7a4afaa9040000006a47304402203fc148ddaf86e9f6ccd6d377020ed6aa1dd68e18d25ba905279d3ac8543847b2022046b9b60bf12b8b63f7ffac3895b6adef474e8dd614f968a1fd18f68cd794f33c0121020686a508c9cd6add2a3aaa41dcb75316c20ad5c2031b6e030829a2b6baa6887dffffffffc6e437fae891a1ec7ad1c5fea4159ca4037f0b9dce9a480f65e08f12e6ff3f98010000006b483045022100ae49deaf61f0110b38fa71d44c6be6a023866ce9524a47069a8d655c4392a9a70220229b658a5567dae2b660c744d44339fdde0df72ca5793a8bd56417d2ad75aa18012103337b056a5e61e0be502ed56b3fd30468a511ff096589df4d8a0b866fcbc20b7bffffffff873ed19c67d3323e8afe1caa9ce62628eac7f9e5e573e633760062396af39d9e010000006a47304402203a3fd37d804647fc9aa6555b7743be8ec8a9531378ae6cba8341c74d25d60dc602203bf8baf07631353df924d8f02387b99944258d5cd56a26bea155318e43c4e1c10121021e43e831fce8bd00d576b4673d6f30ef33162a586775e91cd2cfa36d2421c32dffffffff3e04c75c9f8344ca53c8ecc56837d82933c21cacc37e2a0443f757090104c00d400000006a473044022064cad080a9c1acf12e22275d813b268f49e123b3f098bd4aeeb734a65e19b7d6022046f7cff39b30f6e63f50c87b4571190267fa330383060e8b19615130781b8edd012103c9fe814438ab2ed70e54c6a92c353cfbae251a1442c7476a668b752f1dd7df6bffffffffa58464e38ec54e46dd6ff6c424f128c74028a25bc3d0cebf0185031198830999000000006a473044022015f808ddb78a7beb2f936d467fdf752c8dadb4ec0aba3b38f30ed5bd4e7cb07602201d402f07158d220580a0b2d7e8bfc8f746e9b7e126d4eda282560de079cc3bdb012102843fd03934aedc3d234090276beeb16f86c5c25cf1a06c44d488cef84987ca54ffffffffbb32c4a53bb5840f2a9a6c2437d42c96adaf17fcdf11c1245121210be3363a37000000006b483045022100f5f20664df6f6d5c861a4238e88ca085a11c67142896596aea4fd188f67f752b022016a4b855ee8c8d8760dda51923529ccbbda32962b208d0609f178b1e27706d8301210321b77651529b45d6503e9334a54020fde097ce035f7d5a2de319a775a3bf9858ffffffff3b675e918af5b0b56364a84d66a0fd05f1787129dd2955b667e0513ed55e13b2010000006a473044022031307cc77721f56aa4006bf4742e6f698bd9953112d0cc516558e54ffe1c785d022052ad9330dd673e57eb730ae29bdb0dcd9c04e57a410086866ec4321521ac2b720121036b66ea487bbfc9770b00bb51020dedb0d3cfac96e5ea41f3f6a47ed287ed1930ffffffffe83f61e5a45209a29634560546456e3015ff52e7557fc985a2d1ad41ac4b155e1e0000006a4730440220134520f3e46f42207cedc749048d99dcb797d2cb807dee3a1adf589648c2262d0220276c5b25fe4ea63ef8b8c17c4cfde75fca4e8ee84ab3b7134f14b1d834f7b8690121028f9d8c65f14756059141fc4bd9fdd55b9d014865716f532f2d71e2030ddadd32ffffffffa0391ce0c4b1b46a1e5bd4cff1a3aa120838fe431d01c8bd1b67ce0328db81db000000006b483045022100c578b7feb70e7488687febbe4bfce9bb2194798c175a85e3e98848457d69f0af022049f69ec692316beba4687b9908036f8fd2f5daffb285fc130326541e8a0c81590121021f345af4bcd67d78b07a060165fa1417c22dd8cdd950ba6d9c99755b84d0fb1bffffffff44991f9e638a60ce459a60bbcfce269b5fe07bff720855a50b979416525110dc010000006b483045022100a838018b2738c4e865e67cfaa91fe2e86284a90549a6d8228d581c5af164ffb702202c8cc9ed7cb9efd7f0caf95dca6ddc4aad5fa03377a7a4af812b2e4efb428cd0012102255a037668ab80ed8da7d2cb73fe3fca30a907b1a2fe88febcbfc5a2e6a3cf4effffffff572219acaa9d225e77679afaf287dfb2837672c8719523ec948c61accf12fc13010000006a47304402203f42667d1cd81c6c809d98d8d98eb5b6bb9b8f4aef9bc2d756e6edde1766ebf602204e2a446b2deb13dd027194b9717bb6d2e8d30ae0166f32c22264b646bd0026ef01210224d8a9438a5ca0f9792a959bb420390513702122bc404f2a94502a3220155eb7ffffffff455b40a3f8a43cd3d68eb0224e3ff0d111c02608ad8f59664462bc4962289468000000006b483045022100bb81ffc89d74cfa49aff039354530e1085c4d330fb43538aa35303d2d40168ed02205e43e36497fd0c5021efbbd21d84db0d12be8a9a9f32d61605beb684e9f0d6ab012102f4ad528ad301b2b015fc8a544d8af47af0875c669e896592c4c368689de1775cffffffff0bc76221c4e6039371bab53017b1679e76776e87914e726a7501b2a2b322aeb8000000006a47304402206c59589230a04bca878df8092daf01597797ebcdea385628a5e23e78396f92be0220009e387b9967a350b1365a3019cd6b2a55bc26b09648f298665400c31b19bb02012103493e0753e4cbec164e3a1b14fbf3d9a036e0a60495650365ea90726a9d9e1be4ffffffff6b5a7ea9777b8c09ec559bed07cb3149e12066a3342cd46c807e0c6593d45a7b000000006b483045022100f0331608e0dc8b3ef0e1513fdd661cce04338574ba007340476f6ccea3222c6e02204b2d817056de3971f09d8c9b3fadd251f5c6b82fe4207e78c7806ffaa4282ac8012103a3d0f8e4d42f1f74ac0cf0ea7f20b5376c227e235baa76d7c3846b85e7be64deffffffff93152aff85bed31adc3e185916bcfdd0545fc130417f5cf2156c16d6f47294d9000000006a473044022060b284cc871c949e17d9ac65d45dddf4d5d18a29d506f8a909ef8c85caef817b02204ca9b76b61854672b49f20aee21ec06f9c4ce3050e7d6cb41fa547af172c13d80121026620696444bc8de919687bdb7b9af2debb09ebf6cc6b4c97ee3bc4ffc765703affffffffa6655f25f581b59c07fe4a5f8aaca0d3fffc9acbec8d0d59bfae43b3bf18a167000000006a47304402203205ba57faccfc629dce20d974902bab91111dd6b495dc698098b5dc6a2ec06202200c855cd58262fb1ec685385b1ecb8df5bc53323f68f7b19b25262c9a3c2bef31012103415a305c98c5e25193435c9d37ef2e937d5be2ca076058d72fa16c93bbeeccadffffffff80c4075f6d37f22d5834f182b35cc6851f90418d7ff8987d772c30afb8a33743000000006b483045022100f6188f0a0a9b7dc7397114eb6d8f75f848b0f059ae3d66447635f6a4bbe99999022035448604b9314f59fcb432c1f13393d42bd06ed409aa8f0c597c25d987594579012102bb03233fb087068b53b3b93529d77af5b28ae3bb6b69d9f9aee2a7734ef72a86ffffffff32099af5c2573220eaffab19be4b67ffb754c2b4926d766caa5d573f7a4afaa9010000006a4730440220016fa59ad59233a3a1e902ee5fba6d2a31e7edec87a8df5d430f6c52ca60e211022069e5dc208fb204de938ef65e6c3133f7fb2a21c1192ae1679f21b7ab8d781c15012103354598c57476a31d21757ac2d5b8595e5c9f79bf1a4bebf79e2889c912b86ceffffffffffe8e8f1084026a66a9fd327376b275897d222e7fb54a82216a792c8734882b23000000006b483045022100c409c1a4728d084921ac425ad8bf80efa322a4f68a98b42c61a3b15f7491f10d02202cb32ad65ea04b265bf8885857594fd69df9af47299c4747cbca1fd14d67985c0121038ed372123b94b0a463ed56498f5459af0a678827d02b513a4dab8302fb3edc9bffffffff8ae574a4dfbbc928f9fe43aa9d2bc01e9c77d59e8ca9797c1e0b1133055ef828010000006a473044022043606f3794da23f75ef040a6b78852c087e5d4c66b850bdb3aa3cfac177b265102204d3f6c1079979b063bd80844c05fb6c555c51fe9e9ba322ffe740e5a14babe3a0121033acef6422e6e4af53a56043c8b3295db0bbde9a5b07b2f593162b172600ca831ffffffffdca71bb53579c07675d9913fece28c14fa0e2678cc09cd867ad8621212c85b38000000006a47304402204ab7135ca8db50958fab5f9fe6e60080502fda1a0ea199be29e61e84f8d7542502204262d38605277a4d816fcf7a2e2de0a2776024b56830d7682ef0f2455c16e8030121031e65bf2951da746f49808aea68280a9044e8be3d942d48dba0ce4760ab1fe6a8ffffffff0a768ecebe275e317bc03e759325c98ca604f89412974093b55f696a460dcde1010000006b483045022100928e4336f76e1d705b38ca2e348f60f3258dfb7914df9e0fac0b2455f02be81f02203ee29b2ad15c1927b9633a0ae22537d3bda57a5e5e73229291d32d9721f983da012103a9ced36cec3aaba3a8ea2fb39482b04f93c406b4c024d6fe4046431e04c52840ffffffff2e89e927b611b21ccdcd8acfa19952262e8bef5ab909b8b1ce54b3df8609ef57000000006a473044022059b1736b5c05a584e6918d8a3f9c7ca6084e62ee9ff6d3599ed84ffad05f82b302207004d0b8473f5ad38b3ac7371761048d37b33e5a1233975b53acf1c1e82b0722012102c824ad983edc29fd9fb1c5aa59592857fdc0610f3580a92e41e396172ae4d3d2ffffffffc0b519a902bb6b8d87920efbd5a64cedeea8de6fed81338d2ae5ed29bfc0f0730d0000006a47304402205107d0ad9b84cdf1478ee7feb3f22cfce9207f03de2f9537feecb108e315c0ad022041b2eb98d2f8876b974323933ff2d3b4ea26b7ccd0265cacaeefdeec15e7fe5901210396d0d2566b2d4557e190fb829e953a2e7cd13c6e247dbd137d9db1b2ed1dd6f0ffffffff247824b6423e5e4987ff2c0231df5e03af2554b44bf2d7252af0b566cf9c2287010000006b483045022100cf5172bfb6c2a4cf6cd402f8eddecdf2e72bb10e2e6282a6ff2eeeaad420c5f7022001c59b19d5a070edc7850c1443da8adf67605b987900502e5d562ec663b469a2012102540e279386809f50f29919a691336a5fc8783aec430a043fb3377c0539de7f8bffffffff1c66fb9d86aeeb13839ed90b1457efa6e26c4c42747617de4cad4a1a6b0aa2b6000000006b483045022100e1bc15f5b96178a4992ed344552962749364ed77c0c3047902310affca0ca2eb02207b0876bbfee02d0b82401ec5e27cf90d5b9594c303fc5aa838d4be948c48c31701210257a83638919950d5525b49698c0e9be0ca96e632698d3f1fe45d1fcde045666effffffffe18287836acc5423df3a0cf390185f509f4abde6f2551c3c2263a531de1a3665000000006b483045022100b7c7d95e7d7aeef5040289a78df14d56d9be75865d0efaceea7638dcb556604702204e7181c43b451fe292d0298064407944a31deaf23438190c849106a103e5ec3c012103b26283bb92312e9b10c103ef62e8818937fbc4732781b462588ab33c9d9a9bdbffffffff37765c8685678c3f23aa438f23a88c02fbcca3814e9f29647a7e5c27e52e7dfa010000006b48304502210080b7d173b1c94bde5e807c609aa8facbe4e7fe45a27526f118ea349de34d34af022079e3eab45c85bdfd23c81bd7d990205386b1de4178190440fe2ebcbdde3e57ee012102b88183979d7910c6764c202dc82038f921364ff00726d1659376174efa722435ffffffffddc3da71ae6d8ef665d7e4bc4305ec46bda507d5741677fdc3ccca37fcfdd9dc010000006b483045022100d8756245243db43a1c9e728403b9f540ee66a32589beb729d93c7f6434ced36c02204a942249f3442cf64aedb11d145a6fd5065f44961d31f468d1600327bf5328a9012102157ba4cf52773ba8a802034cdd66f0843ce5ff411c55cc25589d750211e258d0ffffffff71a0c58e95cf15e054b32a28206526eb900fd40a0a7eb322ee13f3b7c4b4d37c010000006b483045022100d6020ac8f7811623a31751fbec73d983795de30632ce924481633c64f2bf43bb02207632c88d603eabddb8c5a2be4c1a69791bd27af788f957569560d7a13138d4c1012102c808b1db3202d1c53110ec1a6ac567fb2e38418c9a86ee8c77b4fed62bf78480ffffffff8cc39659c10d185f547b4499f8a7d5c2c1a416c121e5e588a73b1588cd0763b2000000006a47304402204a5e2055770d76512dd6036e405474a5428d53df396e802d9027edbb697d244402204d1dc257843ba768348aba499888cf6198bde68d6f5efb8220c88b3d19b89e9d01210315fd97969d8da3da41a736a132ea59e08cea97214cac63f94ca41a5d0936f378ffffffffe8a17a3aae98ff2cd719e6a375a5c675bbf30eeb70e800e786dfaa028f6c377a010000006b483045022100dbd4533c12fbf4d997e2761459807145c309a12bcf997c7a6caed2a58366160f022070a59b33698cf62d85dd83c9600252cb4cc32d27b21bb81c04fe029a2a229d72012103787204754cc8c14345b9c46d7012ffa0c72f068d92759217ee94f1813c734bfbffffffff0195cd9f1e425d198a47b99757c2844447a59c2ded459981edc5bc0e18b6857d000000006a473044022045393d1e957b637beafbc86a98e8802cca461d06053e0d70f3735735afa57e6602200ec02c883810ab13a6783eb16410c473c704b1972d7c5f7b3a6e66137abb51f5012102bdcc0da832c11f631cd250b42dc0356c58229e0ea29a36074671ab3642d213b2ffffffffde56f2a555037f6675899b4ca34168431297c1317380b54944f6ab29f239ac7f000000006b483045022100f621d97c03bab6665ebe395755a38bc20fbeb482caa16cb1170b83dee2e3590f02205845db74dcc7957ebf0d2cd3264fb128f58aa0d2633c0ac4f0114d6aa9e5fa05012103bed95295e4788b598c9f89ca3bca2a3411316a8925bfb58ec7da3378f8e08084ffffffffeb26d7072fa07924d916023654f7a82969db9bae0212afc376462f6ffede3619010000006a473044022053d8efd8b2cb59ebb50173184579e51c2d0bc0c1a2f47805402bad6cc8f76487022008b35a1280e0fbb4a5c0f717405d83a37370d5fadf24d1e98056ba9d75de336701210394b1b3900db1e342f28d6e723531dde6f69c8c0f56e9fb2154c012ea7e5fd40cffffffff149db0e21f81b3c389acee62377c606eb8039783a8aa54737354b95afdd2f514050000006b48304502210086ff76cae7e06423e13ff069b92d41aa365d266f46fed1e2ebbb952ae46b7f1b02200de1344019029225ad6d5e4eac8f9469cebcce09c60588f572d1519177b28a48012103a5a299d938deb548e6f24de62702c85ea71b595339f307c8c241ff459a12022effffffff9290f3be25ed99d9c7c5d7b370cc66dfc888b0588211b480965c02f2df7fdbd5000000006a4730440220634c8384ab9bfa9eca8f042d6893d4ff7637015816d63c2515bf4e3bda676d5702205c7510dbff9521afa989054972780307f8a4667cb2dd9da259e52b9e779adc3b01210280f102675044cc642fc80f0040c784c4b3926b2ad38dbd6829505d0b39820a45ffffffff3d7e441a8c27c2fe725eb56361b056a5c74c2ec93ddeec7e596c539a3eab8cae000000006a4730440220056ec9a9371b1d2d5cd50cc17d798fd13e00784b12e4b81734c828242c91b8bb02203e3999805de28b830375aea46d2448ae8ee9bcfe7043c4376408b43929bc1d76012102e6705e047258141f6ccc2099c6cd668c6027dd7c87fb5de690885b1cf72ffa46ffffffff350e773ebec80c8b09d00c6af203fc9ec0890d5f320ba481e92f4f5fe14ef75d000000006b483045022100f68c3ec2c00f6da9da6a1bd208a2c645e091d0b2be2d6b37870948c6db8cd86c02204c0968b42064039d098bb6a0d2b5ca54b580997f9ee0fdd74020bb747e5189c80121029ca9ad2a7365a554de38f27b37fe27b1a678a558e7435349a5d5d0075025b4b5ffffffff7446ae1574d5495a564f2d2989ecd4a99a8817e971cc6939caf4fd59c4aa999b000000006a47304402205b203c5966b04193ded54ba52586435eb25bfa34ef16dae5c4f3ad38c79cb8900220370bd21fae85cad41ff0f7199e8362af04f8e55f0fd9ece147411aeaa1851a31012103d2320202e30cef8944e178e0ea9ab3b4700303d0233802d63592d9116077ce49ffffffff66013188c8146407fb33d013f01e0bd340fd506211efee3c3b51bf3ecd4619b9010000006a473044022051136303f9cd5fec641ddbee921c6f7813b51a69cdb05be1be48b78eab60f2e9022072106c819da70daec90672ae4bcd1d6d52a0ca84ee7f4f073400ebdf1d75b84001210354b4cfdf810a18b05d94545b015c307aeedb273175695f9102b9de23581778ddffffffffac4ffc9ef223a0508b7cccb43a6733f30864f60bce3d69e4fe7e1d652673d12d000000006a473044022061dc898205b57692373ddaffb7eadbac8200b16a5c221a9e7a4efebc7b84dd7702206ce812c04b062fbaa629e85109efc3fab081c7753655a8ae5d8e30804d31c9fb012102814f367e2c130e56817df21587659ba31b20b30c66287446cc434e02d539b828ffffffff7d73931b2dc9bb56d62a948ac312d1932d94585b8fab69e116acafd0f42131aa010000006a47304402205ef9795b8e543fbc798dedce31f059ddf468ab66fa5d4b38fa437271f2cf7d6402201e892c74dcd45ff30aee424efaafb667e57f6f6651218fe6baf8e5c9ce0f3fea01210371d96a4f3069b06aac1c15270b7cab75edb72495cceb12ec3f09552ae4e2bcdbffffffff085bc4e10e8c5277c835dff1ce9de2afe8f28ed1644a1abb41a8351ba3c7c67d000000006a473044022028edb2e3b74c68485f0d722a1570edcc8abbc380d2f3fc80b74c90232e948775022073286930e30b754b07ad614bcfebe846b0b58523592e149dec7eb507ad9a06130121035b6504251725e579aeef4515af4d0c2475c6a2602e8b451d433fd2a3fad0d7bbffffffffa4edfbccff127093b89e14db1436de0ccdbcc929d95dc839da083693de45dd99010000006b483045022100f5d82dedcc5d0df9be5d950bc265cb3b0c2edf46f76e738331c03ece6fb47bda0220020b52a7392d1be77334db8c44351e4a0aeb3edb284edaeb120aa2755c467fdc012102e9310f420c6c9a57b1fed38aa95c7c6b57c2567f793d6e5940bbf7a9070a5412ffffffff669105b6ae92b4caae923f3c96a2bbf103848790c683cb9bfd61e428dedf38e73a0000006b48304502210085f596c0b235bdfb8146e763348f2f8883ba8bec91570a90cccd8f8759c0034002206d30e2332734501c1f72d6bcb2c33988d020d07562c0ea7c39cdb023fe62803b0121031995dec2489c8aa067fc9136cced123df576dba5c5888fb1a0ecde89b45e7688ffffffff16eb8319e0cbfd152eeac4b47b5c240b1f3146707fdb6cb2f14e9649512774f2010000006a47304402206c133e254120d99728255bbea9c1a2c14d0c4034af7be0daf38aa3d551e9092a022048074e5cb566999ab9eb782f67706a52cf5b60a9a85833ca61b0283296d42439012102f763a00e6a49e802855d2769f10078cb788f056b6831a7fc29796c612a50d391ffffffff669105b6ae92b4caae923f3c96a2bbf103848790c683cb9bfd61e428dedf38e74b0000006b48304502210082acd556f11596fcda53ecaeb9964b0424420aa74d8116b0191d02e564fafe1802202ba7af2250a53b107f4318f9c875bf5f7e55dcfc9e1324fcb7862f8c67e1cbb301210230afc8d6eddab1b4998c133e8c98052454ab85754fd6e22a9a7b681c7fb7d124ffffffff4080841e00000000001976a9147b2f06878a9975ea5a55d58c02333783b16a519788ace0c0d425000000001976a914cc463cdd18888b1d489aae0c655afdc415214d4888acda045b00000000001976a914915899f9352cf29f7e5675bdd7fb2314af83930288ac205be300000000001976a91464f850e9708d7f8507b7317e7147e270bc581ccd88aca0252600000000001976a914fea409307b595b56e529636ed205e9d399b9726588ac00de0d00000000001976a914a95eef3b3776eb7c8b78239d781dbd600eff369c88acc05c1500000000001976a91415f4505f6e525d10e1ac181c577d8e59c05b19d388ac60216000000000001976a914cf2ee9d712025469808d2a6eb43ab1cc0088617788ac10f699000000000017a91446d3bf59560b285a4a54311e26a224c81f488eef87e04aef08000000001976a914f09dad39612d68d3dde5e0825541562dd97f0a8e88ac10ea3700000000001976a914ebe2fc67489da26c01e1052901d3342e465b07ff88ac84a3b8010000000017a914d153a434955b86abd5259aed9e439bad1834e55887307939000000000017a9145a9ba020729790e579c5cfe3a8c007e93d86af8387a05a3200000000001976a914a0f3d948f284d9a1f611d3f8cfb6f5e87da3285988ac20a10700000000001976a9144fbfd6a984eee242f85591455298f9af396aa45b88ac16f9d004000000001976a91413da7e70f5f42a30ad248f491f5f24dcbb0b1fc888accdb8a609000000001976a91443a4f75fac4ef7d6463d48155e3319ab4831183d88acf09c0900000000001976a914ff363eedee99b88a5a3f07aa6ec1c4fca60bca8788ac00093d000000000017a914a4171a6de98cb459c60305c65709cf72c02a0cb087609df2000000000017a914dcfc3ceb5ff5d82e5173affe6f73c4a156b53c51871281b700000000001976a914545a30ba21284d2c18dbde9f83d2ff7398c0c3bc88ac601ce011000000001976a914796d59a40614e9d93972d4ee0d50e1162a276f6288ace00f9700000000001976a914006eece84cd51559764e34e08421c2ce319bd29788acc0c62d00000000001976a914d09a67387549f88b70ea1bd71c7c5c5e5794b94088acc40fa403000000001976a914f2c3712ad2c4034b59b94a799c2bd7bba278f76288ac94a8990d000000001976a914a5e630c4aa209675662b62f66ead24c41ae902a288ac80f0fa020000000017a91474d691da1574e6b3c192ecfb52cc8984ee7b6c5687e00f9700000000001976a91480d377b5c188beb6e6874244bc2bc8dad35903ce88ac15080600000000001976a9144594677915d80880bee862e9aed0485e2634d10188ac52475800000000001976a914cd096f136316d7c8d6253a4c40a896e4feb46e9388ac605af405000000001976a91452d0130e056d50d0c622cea7ea70e9237452668a88ac77851f00000000001976a91429f7748b704d63301cf665a9e52c0332273bfc6c88acb02403000000000017a914b1b1aae343c7636f76744c479cde3426acd3859387b6d43800000000001976a9146a78d0cfecb508a5fb6716881759559912f82fff88ac41d59000000000001976a91428add865ea550114f77c6886e23de2cec55168e288ac9b57ce01000000001976a914721c80c3bddb36df920173876b43808a9918a38a88ace0aebb00000000001976a914ef74b83f51198249e9ea9381e9bc2dd34a3f3e5788aca1965e00000000001976a9145de69429e88d2e81bfeaa807dde174b5d120a6e288ac608725070000000017a91499f5f96d316307ffa468c108dc73b0ef5c393e2287404d5b00000000001976a91490e4cbde616cca95026162d0c1190e50a0beeeda88ac8050de19000000001976a914a0856a22904037ef5c5136fc024bf40dfddd730a88ac30dabc00000000001976a914798951994b49039d904ef34dd502d3b1c725672c88acc0849c00000000001976a914d04f74cf2eaa7c33d988771ed304289f2469920b88acc005d901000000001976a914847941e67b5be24cfac6895e2cacfc08e95fb9a788ac009f2400000000001976a9145f6af1b1c703830bad34464a6f530bb2b1804e2f88ac603bea0b000000001976a914013e311e92fce32dd6090380b8544e6228a7bcf288acb021fb0e000000001976a9146dabcc4b830e142dbd9e7653784e5bb87fc8b33a88ac40597307000000001976a914b74e8f4da7cdb6c93056c450080e896517f2ba8888ac070f8400000000001976a914918a1476870110214f38c8ef3f1e673cbd9dc01888ac80969800000000001976a91477bdc81d4117c4ebcf34b8c030a8c443f3787e9988ac447d06000000000017a914d01cb32700c0288150c20143f73601c9ecb2efe3872052a6000000000017a91411dab92adac8dd81e233d763477c01e1d2a544ab8760ae0a00000000001976a9144aed046a341b6f4460617434731147fc7bdfecba88ac3ef21a00000000001976a9142ff1abcfd2c7aec373e856021727b0687d5958b588acc4e906000000000017a9142225d29256d2f26bca966c1199709182bae77c6787f7c5c9010000000017a914fee7ab200b7db24fcb5e6c355e08f37197d808428780f0fa02000000001976a91479f229c4182b8afb5a7cc9c375546c3863c86b3588ac00f19307000000001976a91497530310fd4d7355f3a9033d660333cfdd8edb1e88ac36b72f03000000001976a91445ca6f8e49a818ffecf6c2f238664e7ffef21e9f88ac2013f700000000001976a9141e82b73dd70ed73de3df9c688ae8cb627de94a4488ac404b4c000000000017a9142ed28dfe295a016697e8163c8a9e109e3cf119048741431c0e000000001976a914238a83cd342d4cf63b7ae6a83915cdeabfcb208988ac06b96607000000001976a914f76b9b3c31484243aa96c5c8892d4ec7f9e906e988ac55bc0c36000000001976a914e71debe251bb26c7e757d9ae265da6e5d00f31b988ac00000000",
      "42f7d0545ef45bd3b9cfee6b170cf6314a3bd8b3f09b610eeb436d92993ad440": "0200000001dab020ee0a80a818e4d20a52aa7ba367a0a2d430d22c26ccb4572527e259e14a000000006b4830450221009af6687ea6dc495adfed761c1f78ac30f97879a3ecea704d62cf0e9e1ee99c990220633f9e0dedce631020b343df922cbae0258969135bf5eb8f8757e41eafb683dd0121027d8c99d7d1fbca70c697c82f7acf0fb19c4768cb6cc6b3537e07e476c2bf4444feffffff02c06ced08000000001976a914b7c28f0906b2ac22b270252d7962668bebf9137188ac40eef8050000000017a9142928f43af18d2d60e8a843540d8086b305341339871f5a0700",
      "452c629d67e41baec3ac6f04fe744b4b9617f8f859c63b3002f8684e7a4fee03": "0100000001813f79011acb80925dfe69b3def355fe914bd1d96a3f5f71bf8303c6a989c7d1000000006b483045022100ed81ff192e75a3fd2304004dcadb746fa5e24c5031ccfcf21320b0277457c98f02207a986d955c6e0cb35d446a89d3f56100f4d7f67801c31967743a9c8e10615bed01210349fc4e631e3624a545de3f89f5d8684c7b8138bd94bdd531d2e213bf016b278afeffffff02a135ef01000000001976a914bc3b654dca7e56b04dca18f2566cdaf02e8d9ada88ac99c39800000000001976a9141c4bc762dd5423e332166702cb75f40df79fea1288ac19430600",
      "45f3f79066d251addc04fd889f776c73afab1cb22559376ff820e6166c5e3ad6": "01000000012aa311f7789d362ceb2d802a98a703e0ac44815c021293633b80d08e67232e36010000006a4730440220142d8810ab29cac9199e6b570d47bd5ee402accf9d754cfa7de9b2e84e3997b402207a7d8c77c6a721bc64dba39eabe23e915c979683e621921c243bb35b3f538dfb01210371cb7d04e95471c4ea5c200e8c4729608754c74bee4e289bd66f431482407ec8feffffff02a08601000000000017a914fc7d096f19063ece361e2b309ec4da41fe4d789487f2798e00000000001976a914311b232c3400080eb2636edb8548b47f6835be7688ac31430600",
      "46df1a9484d0a81d03ce0ee543ab6e1a23ed06175c104a178268fad381216c2b": "0100000001868278ed6ddfb6c1ed3ad5f8181eb0c7a385aa0836f01d5e4789e6bd304d87221a000000db00483045022100dc92655fe37036f47756db8102e0d7d5e28b3beb83a8fef4f5dc0559bddfb94e02205a36d4e4e6c7fcd16658c50783e00c341609977aed3ad00937bf4ee942a8993701483045022100da6bee3c93766232079a01639d07fa869598749729ae323eab8eef53577d611b02207bef15429dcadce2121ea07f233115c6f09034c0be68db99980b9a6c5e75402201475221022626e955ea6ea6d98850c994f9107b036b1334f18ca8830bfff1295d21cfdb702103b287eaf122eea69030a0e9feed096bed8045c8b98bec453e1ffac7fbdbd4bb7152aeffffffff04d3b11400000000001976a914904a49878c0adfc3aa05de7afad2cc15f483a56a88ac7f400900000000001976a914418327e3f3dda4cf5b9089325a4b95abdfa0334088ac722c0c00000000001976a914ba35042cfe9fc66fd35ac2224eebdafd1028ad2788acdc4ace020000000017a91474d691da1574e6b3c192ecfb52cc8984ee7b6c568700000000",
      "5418099cc755cb9dd3ebc6cf1a7888ad53a1a3beb5a025bce89eb1bf7f1650a2": "010000000148dcc16482f5c835828020498ec1c35f48a578585721b5a77445a4ce93334d18000000006a4730440220636b9f822ea2f85e6375ecd066a49cc74c20ec4f7cf0485bebe6cc68da92d8ce022068ae17620b12d99353287d6224740b585ff89024370a3212b583fb454dce7c160121021f955d36390a38361530fb3724a835f4f504049492224a028fb0ab8c063511a7ffffffff0220960705000000001976a914d23541bd04c58a1265e78be912e63b2557fb439088aca0860100000000001976a91456d95dc3f2414a210efb7188d287bff487df96c688ac00000000",
      "56f87210814c8baef7068454e517a70da2f2103fc3ac7f687e32a228dc80e115": "0100000001b0ac96e3731db370c5ca83bad90a427d1687b65bc89fa2aef2ceeb567511e59f000000006a473044022021483045c74332e0cdf2ba3c46a7ed2abdfd7a04cd3eef79238e394a9285c8c00220536adca2c48231fa8be7fa0a24e75b0f8ecced44967652e89dd19f7fd03617a70121038262a6c6cec93c2d3ecd6c6072efea86d02ff8e3328bbd0242b20af3425990acffffffff05a8f8c223000000001976a9141d7cd6c75c2e86f4cbf98eaed221b30bd9a0b92888ac00e1f505000000001600141d7cd6c75c2e86f4cbf98eaed221b30bd9a0b92800e1f5050000000022002001d5d92effa6ffba3efa379f9830d0f75618b13393827152d26e4309000e88b100e1f5050000000017a914901c8694c03fafd5522810e0330f26e67a8533cd8700e1f5050000000017a91485b9ff0dcb34cf513d6412c6cf4d76d9dc2401378700000000",
      "75d7454b7010fa28b00f16cccb640b1756fd6e357c03a3b81b9d119505f47b56": "010000000367d54ded4c43569acbc213073fc63bfc49bf420391f0ab304758b16600a8ea88010000006a4730440220404b3bb28af45437c989328122aa6f4462021a0a2d4f20141ebe84e80edd72e202204184dd9d833d57246eaeed39021e9ab8c0546f3270bd9d2fc138a4bf161ea2310121039550662b907f788cc96708dc017aee0d407b74427f11e656b87f84146337f183feffffff5edf7dbc586b5fddace63a6614f5a731787c104d3c1c9225c4542db067d4296d010000006b483045022100b2335adb91e1ac3bb4e0479b54a9e7d4b765d9b646ca71e2547776c4e7e6bdfb02201fa8aaa4d2557768329befd61d4abda95668f88065df6eac6076e3e123c121eb012103b80229ec7a62793132ff432be0ecf21bca774ade18af7eaf2215febad0c4321ffeffffffdfa74eb50768daeb4beca2ca83d1732128d2439f9df9508efc8f7820718b4ae1000000006a47304402204818b29bed4a8ea4eb383f996389866a732b44d98f6342ecc25007ca472526fb0220496ed1213d63b7686f6936940e8f566f291bab211e6600c0f71e3659787b91fc0121036a30f9e6f645191c6216f84c21ae3b4f0aca0c4be987889276089cf9ef7a89d6feffffff028deb0f00000000001976a914cd0b3a22cd16e182291aa2708c41cb38de5a330788acc0e1e400000000001976a91424505f6d2f0fe7c4a3f4af32f50506034d89095d88ac43430600",
      "78457666f82c28aa37b74b506745a7c7684dc7842a52a457b09f09446721e11c": "0100000000010115e180dc28a2327e687facc33f10f2a20da717e5548406f7ae8b4c811072f8560200000000ffffffff0188b3f505000000001976a9141d7cd6c75c2e86f4cbf98eaed221b30bd9a0b92888ac02483045022100f9d3fe35f5ec8ceb07d3db95adcedac446f3b19a8f3174e7e8f904b1594d5b43022074d995d89a278bd874d45d0aea835d3936140397392698b7b5bbcdef8d08f2fd012321038262a6c6cec93c2d3ecd6c6072efea86d02ff8e3328bbd0242b20af3425990acac00000000",
      "954f43dbb30ad8024981c07d1f5eb6c9fd461e2cf1760dd1283f052af746fc88": "0100000000010115e180dc28a2327e687facc33f10f2a20da717e5548406f7ae8b4c811072f856040000002322002001d5d92effa6ffba3efa379f9830d0f75618b13393827152d26e4309000e88b1ffffffff0188b3f505000000001976a9141d7cd6c75c2e86f4cbf98eaed221b30bd9a0b92888ac02473044022038421164c6468c63dc7bf724aa9d48d8e5abe3935564d38182addf733ad4cd81022076362326b22dd7bfaf211d5b17220723659e4fe3359740ced5762d0e497b7dcc012321038262a6c6cec93c2d3ecd6c6072efea86d02ff8e3328bbd0242b20af3425990acac00000000",
      "9e067aedc661fca148e13953df75f8ca6eada9ce3b3d8d68631769ac60999156": "0100000001c228021e1fee6f158cc506edea6bad7ffa421dd14fb7fd7e01c50cc9693e8dbe02000000fdfe0000483045022100c679944ff8f20373685e1122b581f64752c1d22c67f6f3ae26333aa9c3f43d730220793233401f87f640f9c39207349ffef42d0e27046755263c0a69c436ab07febc01483045022100eadc1c6e72f241c3e076a7109b8053db53987f3fcc99e3f88fc4e52dbfd5f3a202201f02cbff194c41e6f8da762e024a7ab85c1b1616b74720f13283043e9e99dab8014c69522102b0c7be446b92624112f3c7d4ffc214921c74c1cb891bf945c49fbe5981ee026b21039021c9391e328e0cb3b61ba05dcc5e122ab234e55d1502e59b10d8f588aea4632102f3bd8f64363066f35968bd82ed9c6e8afecbd6136311bb51e91204f614144e9b53aeffffffff05a08601000000000017a914081fbb6ec9d83104367eb1a6a59e2a92417d79298700350c00000000001976a914677345c7376dfda2c52ad9b6a153b643b6409a3788acc7f341160000000017a914234c15756b9599314c9299340eaabab7f1810d8287c02709000000000017a91469be3ca6195efcab5194e1530164ec47637d44308740420f00000000001976a91487fadba66b9e48c0c8082f33107fdb01970eb80388ac00000000",
      "c586389e5e4b3acb9d6c8be1c19ae8ab2795397633176f5a6442a261bbdefc3a": "0200000000010140d43a99926d43eb0e619bf0b3d83b4a31f60c176beecfb9d35bf45e54d0f7420100000017160014a4b4ca48de0b3fffc15404a1acdc8dbaae226955ffffffff0100e1f5050000000017a9144a1154d50b03292b3024370901711946cb7cccc387024830450221008604ef8f6d8afa892dee0f31259b6ce02dd70c545cfcfed8148179971876c54a022076d771d6e91bed212783c9b06e0de600fab2d518fad6f15a2b191d7fbd262a3e0121039d25ab79f41f75ceaf882411fd41fa670a4c672c23ffaf0e361a969cde0692e800000000",
      "d1c789a9c60383bf715f3f6ad9d14b91fe55f3deb369fe5d9280cb1a01793f81": "0100000002137c53f0fb48f83666fcfd2fe9f12d13e94ee109c5aeabbfa32bb9e02538f4cb000000006a47304402207e6009ad86367fc4b166bc80bf10cf1e78832a01e9bb491c6d126ee8aa436cb502200e29e6dd7708ed419cd5ba798981c960f0cc811b24e894bff072fea8074a7c4c012103bc9e7397f739c70f424aa7dcce9d2e521eb228b0ccba619cd6a0b9691da796a1ffffffff517472e77bc29ae59a914f55211f05024556812a2dd7d8df293265acd8330159010000006b483045022100f4bfdb0b3185c778cf28acbaf115376352f091ad9e27225e6f3f350b847579c702200d69177773cd2bb993a816a5ae08e77a6270cf46b33f8f79d45b0cd1244d9c4c0121031c0b0b95b522805ea9d0225b1946ecaeb1727c0b36c7e34165769fd8ed860bf5ffffffff027a958802000000001976a914a802fc56c704ce87c42d7c92eb75e7896bdc41ae88aca5515e00000000001976a914e82bd75c9c662c3f5700b33fec8a676b6e9391d588ac00000000",
      "d37f9e7282f81b7fd3af0fde8b462a1c28024f1d83cf13637ec18d03f4518feb": "0100000001b74780c0b9903472f84f8697a7449faebbfb1af659ecb8148ce8104347f3f72d010000006b483045022100bb8792c98141bcf4dab4fd4030743b4eff9edde59cec62380c60ffb90121ab7802204b439e3572b51382540c3b652b01327ee8b14cededc992fbc69b1e077a2c3f9f0121027c975c8bdc9717de310998494a2ae63f01b7a390bd34ef5b4c346fa717cba012ffffffff01a627c901000000001976a914af24b3f3e987c23528b366122a7ed2af199b36bc88ac00000000",
      "d869f854e1f8788bcff294cc83b280942a8c728de71eb709a2c29d10bfe21b7c": "0100000000010115e180dc28a2327e687facc33f10f2a20da717e5548406f7ae8b4c811072f8560100000000ffffffff0100b4f505000000001976a9141d7cd6c75c2e86f4cbf98eaed221b30bd9a0b92888ac02483045022100df7b7e5cda14ddf91290e02ea10786e03eb11ee36ec02dd862fe9a326bbcb7fd02203f5b4496b667e6e281cc654a2da9e4f08660c620a1051337fa8965f727eb19190121038262a6c6cec93c2d3ecd6c6072efea86d02ff8e3328bbd0242b20af3425990ac00000000"
  };
  const txFetcher = TransactionFetcher.fromStringMap(new Map(Object.entries(txCache)));
  const raxTx = BytesObj.fromHexString('0100000001813f79011acb80925dfe69b3def355fe914bd1d96a3f5f71bf8303c6a989c7d1000000006b483045022100ed81ff192e75a3fd2304004dcadb746fa5e24c5031ccfcf21320b0277457c98f02207a986d955c6e0cb35d446a89d3f56100f4d7f67801c31967743a9c8e10615bed01210349fc4e631e3624a545de3f89f5d8684c7b8138bd94bdd531d2e213bf016b278afeffffff02a135ef01000000001976a914bc3b654dca7e56b04dca18f2566cdaf02e8d9ada88ac99c39800000000001976a9141c4bc762dd5423e332166702cb75f40df79fea1288ac19430600').toBytes();
  const tx = Transaction.parse(new BytesReader(raxTx));
  const raxTx2 = BytesObj.fromHexString('010000000456919960ac691763688d3d3bcea9ad6ecaf875df5339e148a1fc61c6ed7a069e010000006a47304402204585bcdef85e6b1c6af5c2669d4830ff86e42dd205c0e089bc2a821657e951c002201024a10366077f87d6bce1f7100ad8cfa8a064b39d4e8fe4ea13a7b71aa8180f012102f0da57e85eec2934a82a585ea337ce2f4998b50ae699dd79f5880e253dafafb7feffffffeb8f51f4038dc17e6313cf831d4f02281c2a468bde0fafd37f1bf882729e7fd3000000006a47304402207899531a52d59a6de200179928ca900254a36b8dff8bb75f5f5d71b1cdc26125022008b422690b8461cb52c3cc30330b23d574351872b7c361e9aae3649071c1a7160121035d5c93d9ac96881f19ba1f686f15f009ded7c62efe85a872e6a19b43c15a2937feffffff567bf40595119d1bb8a3037c356efd56170b64cbcc160fb028fa10704b45d775000000006a47304402204c7c7818424c7f7911da6cddc59655a70af1cb5eaf17c69dadbfc74ffa0b662f02207599e08bc8023693ad4e9527dc42c34210f7a7d1d1ddfc8492b654a11e7620a0012102158b46fbdff65d0172b7989aec8850aa0dae49abfb84c81ae6e5b251a58ace5cfeffffffd63a5e6c16e620f86f375925b21cabaf736c779f88fd04dcad51d26690f7f345010000006a47304402200633ea0d3314bea0d95b3cd8dadb2ef79ea8331ffe1e61f762c0f6daea0fabde022029f23b3e9c30f080446150b23852028751635dcee2be669c2a1686a4b5edf304012103ffd6f4a67e94aba353a00882e563ff2722eb4cff0ad6006e86ee20dfe7520d55feffffff0251430f00000000001976a914ab0c0b2e98b1ab6dbf67d4750b0a56244948a87988ac005a6202000000001976a9143c82d7df364eb6c75be8c80df2b3eda8db57397088ac46430600').toBytes();
  const tx2 = Transaction.parse(new BytesReader(raxTx2));
  const input = new Input(BytesObj.fromHexString('d1c789a9c60383bf715f3f6ad9d14b91fe55f3deb369fe5d9280cb1a01793f81').toBytes(), 0);
  const tests = [
      {
          testName: 'parsing tx',
          testCases: [
              {
                  name: 'version',
                  got: tx.version,
                  want: 1,
              },
              {
                  name: 'locktime',
                  got: tx.locktime,
                  want: 410393,
              },
              {
                  name: 'inputs',
                  got: tx.inputs.length,
                  want: 1,
              },
              {
                  name: 'input prev_tx',
                  got: tx.inputs[0].prevTx,
                  want: BytesObj.fromHexString('d1c789a9c60383bf715f3f6ad9d14b91fe55f3deb369fe5d9280cb1a01793f81').toBytes(),
              },
              {
                  name: 'input prev_index',
                  got: tx.inputs[0].prevTxIndex,
                  want: 0,
              },
              {
                  name: 'input sequence',
                  got: tx.inputs[0].sequence,
                  want: 0xfffffffe,
              },
              {
                  name: 'input script_sig',
                  got: tx.inputs[0].scriptSig.serializeToBytes(),
                  want: BytesObj.fromHexString('6b483045022100ed81ff192e75a3fd2304004dcadb746fa5e24c5031ccfcf21320b0277457c98f02207a986d955c6e0cb35d446a89d3f56100f4d7f67801c31967743a9c8e10615bed01210349fc4e631e3624a545de3f89f5d8684c7b8138bd94bdd531d2e213bf016b278a').toBytes(),
              },
              {
                  name: 'outputs',
                  got: tx.outputs.length,
                  want: 2,
              },
              {
                  name: 'output 0 amount',
                  got: tx.outputs[0].amount,
                  want: 32454049n,
              },
              {
                  name: 'output 0 script_pubkey',
                  got: tx.outputs[0].scriptPubKey.serializeToBytes(),
                  want: BytesObj.fromHexString('1976a914bc3b654dca7e56b04dca18f2566cdaf02e8d9ada88ac').toBytes(),
              },
              {
                  name: 'output 1 amount',
                  got: tx.outputs[1].amount,
                  want: 10011545n,
              },
              {
                  name: 'output 1 script_pubkey',
                  got: tx.outputs[1].scriptPubKey.serializeToBytes(),
                  want: BytesObj.fromHexString('1976a9141c4bc762dd5423e332166702cb75f40df79fea1288ac').toBytes(),
              },
              {
                  name: 'serialize',
                  got: BytesObj.fromSafeArray(tx.serializeToBytes()).toHexString(),
                  want: BytesObj.fromSafeArray(raxTx).toHexString(),
              },
              {
                  name: 'fees',
                  gotFunc: async () => await txFetcher.getTransactionFee(tx),
                  want: 40000n,
              },
              {
                  name: 'fees 2',
                  gotFunc: async () => await txFetcher.getTransactionFee(tx2),
                  want: 140500n,
              },
          ],
      },
      {
          testName: 'TxFetcher',
          testCases: [
              {
                  name: 'input value',
                  gotFunc: async () => await txFetcher.getInputValue(input),
                  want: 42505594n,
              },
              {
                  name: 'previous output script pubkey',
                  gotFunc: async () => (await txFetcher.getInputScriptPubKey(input)).serializeToBytes(),
                  want: BytesObj.fromHexString('1976a914a802fc56c704ce87c42d7c92eb75e7896bdc41ae88ac').toBytes(),
              },
              {
                  name: 'signature hash',
                  gotFunc: async () => await txFetcher.getTransactionSigHash(await txFetcher.fetchTransaction('452c629d67e41baec3ac6f04fe744b4b9617f8f859c63b3002f8684e7a4fee03'), 0),
                  want: BigInt('0x' + '27e0c5994dec7824e56dec6b2fcb342eb7cdb0d0957c2fce9882f715e85d81a6'),
              },
              {
                  name: 'verify tx',
                  gotFunc: async () => await txFetcher.verifyTransaction(await txFetcher.fetchTransaction('452c629d67e41baec3ac6f04fe744b4b9617f8f859c63b3002f8684e7a4fee03')),
                  want: true,
              },
              {
                  name: 'verify tx in testnet',
                  gotFunc: async () => await txFetcher.verifyTransaction(await txFetcher.fetchTransaction('5418099cc755cb9dd3ebc6cf1a7888ad53a1a3beb5a025bce89eb1bf7f1650a2', true)),
                  want: true,
              },
              {
                  name: 'sign transaction',
                  gotFunc: async () => {
                      //           private_key = PrivateKey(secret=8675309)
                      // stream = BytesIO(bytes.fromhex('010000000199a24308080ab26e6fb65c4eccfadf76749bb5bfa8cb08f291320b3c21e56f0d0d00000000ffffffff02408af701000000001976a914d52ad7ca9b3d096a38e752c2018e6fbc40cdf26f88ac80969800000000001976a914507b27411ccf7f16f10297de6cef3f291623eddf88ac00000000'))
                      // tx_obj = Tx.parse(stream, testnet=True)
                      // self.assertTrue(tx_obj.sign_input(0, private_key))
                      // want = '010000000199a24308080ab26e6fb65c4eccfadf76749bb5bfa8cb08f291320b3c21e56f0d0d0000006b4830450221008ed46aa2cf12d6d81065bfabe903670165b538f65ee9a3385e6327d80c66d3b502203124f804410527497329ec4715e18558082d489b218677bd029e7fa306a72236012103935581e52c354cd2f484fe8ed83af7a3097005b2f9c60bff71d35bd795f54b67ffffffff02408af701000000001976a914d52ad7ca9b3d096a38e752c2018e6fbc40cdf26f88ac80969800000000001976a914507b27411ccf7f16f10297de6cef3f291623eddf88ac00000000'
                      // self.assertEqual(tx_obj.serialize().hex(), want)
                      const privateKey = new PrivateKey(8675309n);
                      const txBytes = BytesObj.fromHexString('010000000199a24308080ab26e6fb65c4eccfadf76749bb5bfa8cb08f291320b3c21e56f0d0d00000000ffffffff02408af701000000001976a914d52ad7ca9b3d096a38e752c2018e6fbc40cdf26f88ac80969800000000001976a914507b27411ccf7f16f10297de6cef3f291623eddf88ac00000000');
                      const tx = Transaction.parse(new BytesReader(txBytes.toBytes()));
                      const success = await txFetcher.signInput(tx, 0, privateKey);
                      return [success, BytesObj.fromBytes(tx.serializeToBytes()).toHexString()];
                  },
                  want: [
                      true,
                      '010000000199a24308080ab26e6fb65c4eccfadf76749bb5bfa8cb08f291320b3c21e56f0d0d0000006b4830450221008ed46aa2cf12d6d81065bfabe903670165b538f65ee9a3385e6327d80c66d3b502203124f804410527497329ec4715e18558082d489b218677bd029e7fa306a72236012103935581e52c354cd2f484fe8ed83af7a3097005b2f9c60bff71d35bd795f54b67ffffffff02408af701000000001976a914d52ad7ca9b3d096a38e752c2018e6fbc40cdf26f88ac80969800000000001976a914507b27411ccf7f16f10297de6cef3f291623eddf88ac00000000',
                  ],
              }
          ],
      },
  ];
  tests.forEach(test => {
      runTest(test);
  });

})();
//# sourceMappingURL=testMain.js.map
