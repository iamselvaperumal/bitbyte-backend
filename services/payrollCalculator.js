const AppError = require('../utils/AppError');
const { amountInWords } = require('../utils/amountInWords');

const COMPONENT_KEYS = {
  basicPay: 'basicPay',
  hra: 'hra',
  da: 'da',
  otherAllowance: 'otherAllowance',
  pf: 'pf',
  esi: 'esi',
  professionalTax: 'professionalTax',
  incomeTax: 'incomeTax',
};

const COMPONENT_LABELS = {
  [COMPONENT_KEYS.basicPay]: 'Basic Pay',
  [COMPONENT_KEYS.hra]: 'HRA',
  [COMPONENT_KEYS.da]: 'DA',
  [COMPONENT_KEYS.otherAllowance]: 'Other Allowance',
  [COMPONENT_KEYS.pf]: 'PF',
  [COMPONENT_KEYS.esi]: 'ESI',
  [COMPONENT_KEYS.professionalTax]: 'Professional Tax',
  [COMPONENT_KEYS.incomeTax]: 'Income Tax',
};

const DEFAULT_RULES = {
  engine: 'indian-payroll-v1',
  basicPayRate: 0.5,
  hraRateOfBasicPay: 0.4,
  daRateOfBasicPay: 0.2,
  pfRateOfBasicAndDa: 0.12,
  esiGrossThreshold: 21000,
  esiRateOfGross: 0.0075,
  professionalTaxThreshold: 15000,
  professionalTaxAmount: 200,
  incomeTaxSlabs: [
    { upto: 400000, rate: 0 },
    { upto: 800000, rate: 0.05 },
    { upto: 1200000, rate: 0.1 },
    { upto: 1600000, rate: 0.15 },
    { upto: 2000000, rate: 0.2 },
    { upto: 2400000, rate: 0.25 },
    { upto: Infinity, rate: 0.3 },
  ],
};

const LABEL_ALIASES = new Map([
  ['basic pay', COMPONENT_KEYS.basicPay],
  ['basic', COMPONENT_KEYS.basicPay],
  ['bp', COMPONENT_KEYS.basicPay],
  ['hra', COMPONENT_KEYS.hra],
  ['house rent allowance', COMPONENT_KEYS.hra],
  ['da', COMPONENT_KEYS.da],
  ['dearness allowance', COMPONENT_KEYS.da],
  ['other allowance', COMPONENT_KEYS.otherAllowance],
  ['other allowances', COMPONENT_KEYS.otherAllowance],
  ['conveyance allowance', COMPONENT_KEYS.otherAllowance],
  ['pf', COMPONENT_KEYS.pf],
  ['provident fund', COMPONENT_KEYS.pf],
  ['esi', COMPONENT_KEYS.esi],
  ['esic', COMPONENT_KEYS.esi],
  ['professional tax', COMPONENT_KEYS.professionalTax],
  ['pt', COMPONENT_KEYS.professionalTax],
  ['income tax', COMPONENT_KEYS.incomeTax],
  ['it', COMPONENT_KEYS.incomeTax],
]);

const STANDARD_EARNING_KEYS = new Set([
  COMPONENT_KEYS.basicPay,
  COMPONENT_KEYS.hra,
  COMPONENT_KEYS.da,
  COMPONENT_KEYS.otherAllowance,
]);

const STANDARD_DEDUCTION_KEYS = new Set([
  COMPONENT_KEYS.pf,
  COMPONENT_KEYS.esi,
  COMPONENT_KEYS.professionalTax,
  COMPONENT_KEYS.incomeTax,
]);

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const numberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getRuntimeRules = (overrides = {}) => ({
  ...DEFAULT_RULES,
  daRateOfBasicPay: numberOrDefault(process.env.PAYROLL_DA_RATE, DEFAULT_RULES.daRateOfBasicPay),
  ...overrides,
});

const normalizeLabel = (label) => String(label || '').trim().toLowerCase();

const getComponentKey = (component = {}) => {
  if (component.key && Object.values(COMPONENT_KEYS).includes(component.key)) return component.key;
  return LABEL_ALIASES.get(normalizeLabel(component.label));
};

const normalizeComponent = (component = {}) => {
  const key = getComponentKey(component);
  const label = String(component.label || (key ? COMPONENT_LABELS[key] : '')).trim();

  return {
    ...(key ? { key } : {}),
    label,
    amount: roundMoney(component.amount || 0),
    ...(component.formula ? { formula: String(component.formula).trim() } : {}),
    systemGenerated: Boolean(component.systemGenerated),
  };
};

const normalizeComponents = (components = []) =>
  components
    .map(normalizeComponent)
    .filter((component) => component.label.length > 0);

const sumComponents = (components = []) =>
  roundMoney(components.reduce((total, component) => total + Number(component.amount || 0), 0));

const assertNonNegativeComponents = (components, type) => {
  components.forEach((component) => {
    if (!component.label) {
      throw new AppError(`${type} component label is required.`, 400);
    }
    if (!Number.isFinite(component.amount) || component.amount < 0) {
      throw new AppError(`${component.label} must be a positive amount.`, 400);
    }
  });
};

const isStandardEarning = (component) => STANDARD_EARNING_KEYS.has(getComponentKey(component));
const isStandardDeduction = (component) => STANDARD_DEDUCTION_KEYS.has(getComponentKey(component));

const systemComponent = (key, amount, formula) => ({
  key,
  label: COMPONENT_LABELS[key],
  amount: roundMoney(amount),
  formula,
  systemGenerated: true,
});

const calculateIncomeTax = (annualSalary, slabs) => {
  const slab = slabs.find((item) => annualSalary <= item.upto) || slabs[slabs.length - 1];
  const annualTax = roundMoney(annualSalary * slab.rate);

  return {
    annualSalary: roundMoney(annualSalary),
    annualTax,
    monthlyTax: roundMoney(annualTax / 12),
    rate: slab.rate,
  };
};

const buildCalculationMetadata = ({
  rules,
  grossEarnings,
  incomeTax,
  additionalEarnings,
  additionalDeductions,
}) => ({
  engine: rules.engine,
  salaryBasis: 'monthly',
  generatedAt: new Date(),
  additionalEarnings: sumComponents(additionalEarnings),
  additionalDeductions: sumComponents(additionalDeductions),
  rules: {
    basicPayPercentOfFixedSalary: roundMoney(rules.basicPayRate * 100),
    hraPercentOfBasicPay: roundMoney(rules.hraRateOfBasicPay * 100),
    daPercentOfBasicPay: roundMoney(rules.daRateOfBasicPay * 100),
    pfPercentOfBasicAndDa: roundMoney(rules.pfRateOfBasicAndDa * 100),
    esiGrossThreshold: rules.esiGrossThreshold,
    esiPercentOfGross: roundMoney(rules.esiRateOfGross * 100),
    professionalTaxThreshold: rules.professionalTaxThreshold,
    professionalTaxAmount: rules.professionalTaxAmount,
    incomeTaxAnnualSalary: incomeTax.annualSalary,
    incomeTaxAnnualTax: incomeTax.annualTax,
    incomeTaxRatePercent: roundMoney(incomeTax.rate * 100),
    grossSalaryUsedForDeductions: roundMoney(grossEarnings),
  },
});

const validateNetSalary = (grossEarnings, totalDeductions) => {
  const netSalary = roundMoney(grossEarnings - totalDeductions);

  if (netSalary < 0) {
    throw new AppError('Total deductions cannot exceed gross earnings.', 400);
  }

  return netSalary;
};

const calculateAutomaticPayroll = ({
  fixedSalary,
  earnings = [],
  deductions = [],
  ruleOverrides = {},
} = {}) => {
  const rules = getRuntimeRules(ruleOverrides);
  const monthlyFixedSalary = roundMoney(fixedSalary);

  if (!Number.isFinite(monthlyFixedSalary) || monthlyFixedSalary <= 0) {
    throw new AppError('Fixed salary must be greater than zero.', 400);
  }

  const basicPay = roundMoney(monthlyFixedSalary * rules.basicPayRate);
  const hra = roundMoney(basicPay * rules.hraRateOfBasicPay);
  const da = roundMoney(basicPay * rules.daRateOfBasicPay);
  const otherAllowance = roundMoney(monthlyFixedSalary - (basicPay + hra + da));

  if (otherAllowance < 0) {
    throw new AppError('Configured earning percentages exceed the fixed salary.', 400);
  }

  const additionalEarnings = normalizeComponents(earnings).filter((component) => !isStandardEarning(component));
  const standardEarnings = [
    systemComponent(COMPONENT_KEYS.basicPay, basicPay, '50% of Fixed Salary'),
    systemComponent(COMPONENT_KEYS.hra, hra, '40% of Basic Pay'),
    systemComponent(COMPONENT_KEYS.da, da, `${roundMoney(rules.daRateOfBasicPay * 100)}% of Basic Pay`),
    systemComponent(COMPONENT_KEYS.otherAllowance, otherAllowance, 'Fixed Salary - (Basic Pay + HRA + DA)'),
  ];

  assertNonNegativeComponents(additionalEarnings, 'Earning');

  const normalizedEarnings = [...standardEarnings, ...additionalEarnings];
  const grossEarnings = sumComponents(normalizedEarnings);
  const incomeTax = calculateIncomeTax(grossEarnings * 12, rules.incomeTaxSlabs);

  const standardDeductions = [
    systemComponent(COMPONENT_KEYS.pf, (basicPay + da) * rules.pfRateOfBasicAndDa, '12% of (Basic Pay + DA)'),
    systemComponent(
      COMPONENT_KEYS.esi,
      grossEarnings <= rules.esiGrossThreshold ? grossEarnings * rules.esiRateOfGross : 0,
      '0.75% of Gross Earnings when Gross <= 21000',
    ),
    systemComponent(
      COMPONENT_KEYS.professionalTax,
      grossEarnings > rules.professionalTaxThreshold ? rules.professionalTaxAmount : 0,
      '200 when Gross Salary > 15000',
    ),
    systemComponent(COMPONENT_KEYS.incomeTax, incomeTax.monthlyTax, 'Annual slab tax / 12'),
  ];
  const additionalDeductions = normalizeComponents(deductions).filter((component) => !isStandardDeduction(component));

  assertNonNegativeComponents(additionalDeductions, 'Deduction');

  const normalizedDeductions = [...standardDeductions, ...additionalDeductions];
  const totalDeductions = sumComponents(normalizedDeductions);
  const netSalary = validateNetSalary(grossEarnings, totalDeductions);

  return {
    fixedSalary: monthlyFixedSalary,
    earnings: normalizedEarnings,
    deductions: normalizedDeductions,
    grossEarnings,
    totalDeductions,
    netSalary,
    amountInWords: amountInWords(netSalary),
    calculationMetadata: buildCalculationMetadata({
      rules,
      grossEarnings,
      incomeTax,
      additionalEarnings,
      additionalDeductions,
    }),
  };
};

const calculateManualPayroll = ({ earnings = [], deductions = [] } = {}) => {
  const normalizedEarnings = normalizeComponents(earnings);
  const normalizedDeductions = normalizeComponents(deductions);

  if (!normalizedEarnings.length) {
    throw new AppError('At least one earning component is required.', 400);
  }

  assertNonNegativeComponents(normalizedEarnings, 'Earning');
  assertNonNegativeComponents(normalizedDeductions, 'Deduction');

  const grossEarnings = sumComponents(normalizedEarnings);
  const totalDeductions = sumComponents(normalizedDeductions);
  const netSalary = validateNetSalary(grossEarnings, totalDeductions);

  return {
    fixedSalary: grossEarnings,
    earnings: normalizedEarnings,
    deductions: normalizedDeductions,
    grossEarnings,
    totalDeductions,
    netSalary,
    amountInWords: amountInWords(netSalary),
    calculationMetadata: {
      engine: 'manual-payroll-v1',
      salaryBasis: 'monthly',
      generatedAt: new Date(),
      rules: {
        grossSalaryUsedForDeductions: grossEarnings,
      },
    },
  };
};

const calculatePayroll = (input = {}) => {
  if (input.fixedSalary !== undefined && input.fixedSalary !== null && input.fixedSalary !== '') {
    return calculateAutomaticPayroll(input);
  }

  return calculateManualPayroll(input);
};

module.exports = {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  DEFAULT_RULES,
  calculateAutomaticPayroll,
  calculateIncomeTax,
  calculateManualPayroll,
  calculatePayroll,
  normalizeComponents,
  roundMoney,
  sumComponents,
};
