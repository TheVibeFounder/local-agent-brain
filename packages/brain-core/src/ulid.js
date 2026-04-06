import crypto from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(time, length) {
  let value = BigInt(time);
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output = ENCODING[Number(value % 32n)] + output;
    value /= 32n;
  }

  return output;
}

function encodeRandom(length) {
  const bytes = crypto.randomBytes(length);
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output += ENCODING[bytes[index] % 32];
  }

  return output;
}

export function createUlid(now = Date.now()) {
  return `${encodeTime(now, 10)}${encodeRandom(16)}`;
}
