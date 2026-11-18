// Format checks for Indian identity and bank fields.
// Empty values are allowed. A stored encrypted blob (iv:ciphertext) is left alone.

const PAN_HOLDER_TYPES = 'ABCFGHLJPT';

function looksEncrypted(value) {
  return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(String(value || '').trim());
}

function verhoeffValid(num) {
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  const digits = String(num).split('').reverse();
  for (let i = 0; i < digits.length; i += 1) {
    c = d[c][p[i % 8][Number(digits[i])]];
  }
  return c === 0;
}

function aadhaarError(value) {
  const raw = String(value || '').replace(/\s/g, '');
  if (!raw || looksEncrypted(raw)) return '';
  if (!/^[2-9]\d{11}$/.test(raw)) {
    return 'Aadhaar must be 12 digits and cannot start with 0 or 1.';
  }
  if (/^(\d)\1{11}$/.test(raw)) {
    return 'Aadhaar cannot be the same digit repeated.';
  }
  if (!verhoeffValid(raw)) {
    return 'Aadhaar checksum is not valid. Check the number.';
  }
  return '';
}

function panError(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw || looksEncrypted(raw)) return '';
  const pattern = new RegExp(`^[A-Z]{3}[${PAN_HOLDER_TYPES}][A-Z][0-9]{4}[A-Z]$`);
  if (!pattern.test(raw)) {
    return 'PAN must be 5 letters, 4 digits, then 1 letter (example ABCPD1234F). The 4th letter is the holder type, P for a person.';
  }
  return '';
}

function accountNumberError(value) {
  const raw = String(value || '').replace(/\s/g, '');
  if (!raw || looksEncrypted(raw)) return '';
  if (!/^\d{9,18}$/.test(raw)) {
    return 'Account number must be 9 to 18 digits.';
  }
  if (/^0+$/.test(raw)) {
    return 'Account number cannot be all zeros.';
  }
  return '';
}

function ifscError(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw || looksEncrypted(raw)) return '';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw)) {
    return 'IFSC must be 11 characters: 4 letters, then 0, then 6 letters or digits (example SBIN0001234).';
  }
  return '';
}

module.exports = {
  looksEncrypted,
  aadhaarError,
  panError,
  accountNumberError,
  ifscError,
};
