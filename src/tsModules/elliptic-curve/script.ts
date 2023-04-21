import { BytesReader } from "./bytesReader";
import { Bytes, BytesObj, makeByte } from "./ooBytes";
import { Command, isData, isOpCode, opCodeToFunc, OpContext, Stack } from "./operations";
import { varIntFromBytesReaderToBigInt, varIntToBytes } from "./varInt";



export class Script {
  constructor(public cmds: Command[] = []) {}

  static parse(reader: BytesReader) {
    // TODO check if we can assume to length to be less than 2^32.
    const length = Number(varIntFromBytesReaderToBigInt(reader));
    const cmds: Command[] = [];
    let count = 0;
    while (count < length) {
      const currentByte = reader.read(1)[0];
      count += 1;
      if (currentByte >= 1 && currentByte <= 75) {
        cmds.push(reader.read(currentByte));
        count += currentByte;
      } else if (currentByte === 76) {
        const dataLength = reader.read(1)[0];
        count += 1;
        cmds.push(reader.read(dataLength));
        count += dataLength;
      } else if (currentByte === 77) {
        const dataLength = Number(BytesObj.fromBytes(reader.read(2)).toLittleEndianNum());
        count += 2;
        cmds.push(reader.read(dataLength));
        count += dataLength;
      } else {
        cmds.push(currentByte);
      }
    }
    if (count !== length) {
      throw `parsing script failed. count: ${count}, length: ${length}`;
    }
    return new Script(cmds);
  }

  rawSerializeToBytes(): Bytes {
    const result: Bytes = [];
    this.cmds.forEach(cmd => {
      if (isOpCode(cmd)) {
        result.push(cmd);
      } else {
        const length = cmd.length;
        if (length <= 75) {
          result.push(makeByte(length));
        } else if (length <= 0xff) {
          // 76 is pushdata1
          result.push(76, makeByte(length));
        } else if (length <= 520) {
          // 77 is pushdata2; 520 is the max length of data allowed.
          result.push(77, ...BytesObj.fromLittleEndianNum(BigInt(length), 2).toArray());
        } else {
          throw 'The data command is too long';
        }
        result.push(...cmd);
      }
    });
    return result;
  }
  serializeToBytes(): Bytes {
    const raw = this.rawSerializeToBytes();
    const total = raw.length;
    return [...varIntToBytes(total), ...raw];
  }

  async evaluate(z: bigint) {
    const clonedCmds: Command[] = JSON.parse(JSON.stringify(this.cmds));
    const stack: Stack = [];
    const altStack: Stack = [];
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
        console.log(
          `Script evaluation failed. cmd, stack, altStack, cmds, clonedCmds, z:`,
          cmd, stack, altStack, this.cmds, clonedCmds, z);
        return false;
      }
    }
    const topElt = stack.pop();
    if (topElt === undefined || BytesObj.fromBytes(topElt).toBigEndianNum() === 0n) {
      return false;
    }
    return true;
  }

  add(other: Script) {
    return new Script([...this.cmds, ...other.cmds]);
  }
}
