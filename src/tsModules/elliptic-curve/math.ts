export function mod(a: bigint, b: bigint): bigint {
  return ((a % b) + b) % b;
}

export function modExp(base: bigint, exponent: bigint, prime: bigint) {
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
