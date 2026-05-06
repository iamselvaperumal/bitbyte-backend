const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

const twoDigitsToWords = (num) => {
  if (num < 20) return ONES[num];
  return `${TENS[Math.floor(num / 10)]} ${ONES[num % 10]}`.trim();
};

const threeDigitsToWords = (num) => {
  const hundred = Math.floor(num / 100);
  const remainder = num % 100;

  return [
    hundred ? `${ONES[hundred]} Hundred` : '',
    remainder ? twoDigitsToWords(remainder) : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const integerToIndianWords = (value) => {
  const num = Math.floor(Math.abs(value));
  if (num === 0) return 'Zero';

  const parts = [];
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;

  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));

  return parts.join(' ');
};

const amountInWords = (amount) => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const rupees = Math.floor(Math.abs(safeAmount));
  const paise = Math.round((Math.abs(safeAmount) - rupees) * 100);

  const rupeeText = `${integerToIndianWords(rupees)} Rupees`;
  const paiseText = paise ? ` and ${integerToIndianWords(paise)} Paise` : '';

  return `${rupeeText}${paiseText} Only`;
};

module.exports = {
  amountInWords,
};
