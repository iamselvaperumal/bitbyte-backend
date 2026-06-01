const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
const DEFAULT_EMPLOYEE_MASTER_SHEET_NAME = "Employee_Master";
const DEFAULT_ATTENDANCE_LOG_SHEET_NAME = "Attendance_Log";
const DEFAULT_COLUMN_START = "A";
const DEFAULT_COLUMN_END = "Z";
const DEFAULT_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_MAX_RECORDS = 500;
const DEFAULT_MASTER_MAX_RECORDS = 2000;
const MAX_RECORD_CAP = 5000;
const PRESENT_THRESHOLD_MINUTES = 3 * 60 + 30;

const cache = new Map();

const headerAliases = {
  employeeId: [
    "empid",
    "employeeid",
    "empcode",
    "employee code",
    "employee no",
    "id",
  ],
  employeeName: [
    "employeename",
    "employee name",
    "name",
    "fullname",
    "full name",
    "employee",
  ],
  dateOfJoining: [
    "dateofjoining",
    "date of joining",
    "doj",
    "joiningdate",
    "joining date",
  ],
  designation: ["designation", "jobtitle", "job title", "title"],
  department: ["department", "dept"],
  position: ["position", "employmentposition", "employment position", "role"],
  attendanceDate: ["attendancedate", "attendance date", "date", "day"],
  shift1CheckIn: [
    "shift1in",
    "shift1checkin",
    "shift 1 in",
    "shift 1 check-in",
    "shift 1 check in",
    "s1checkin",
    "s1 in",
  ],
  shift1CheckOut: [
    "shift1out",
    "shift1checkout",
    "shift 1 out",
    "shift 1 check-out",
    "shift 1 check out",
    "s1checkout",
    "s1 out",
  ],
  shift2CheckIn: [
    "shift2in",
    "shift2checkin",
    "shift 2 in",
    "shift 2 check-in",
    "shift 2 check in",
    "s2checkin",
    "s2 in",
  ],
  shift2CheckOut: [
    "shift2out",
    "shift2checkout",
    "shift 2 out",
    "shift 2 check-out",
    "shift 2 check out",
    "s2checkout",
    "s2 out",
  ],
  onDutyStatus: [
    "ondutystatus",
    "on duty status",
    "onduty",
    "on duty",
    "od",
    "duty status",
  ],
};

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeCell = (value) => String(value ?? "").trim();

const normalizedAliases = Object.fromEntries(
  Object.entries(headerAliases).map(([key, aliases]) => [
    key,
    aliases.map(normalizeHeader),
  ]),
);

const findColumnIndex = (headers, key) => {
  const aliases = normalizedAliases[key];
  const normalizedHeaders = headers.map(normalizeHeader);
  const exactMatch = normalizedHeaders.findIndex((header) =>
    aliases.includes(header),
  );
  if (exactMatch >= 0) return exactMatch;

  return normalizedHeaders.findIndex((header) =>
    aliases.some((alias) => alias.length > 3 && header.includes(alias)),
  );
};

const getCell = (row, index) => (index >= 0 ? normalizeCell(row[index]) : "");

const debugGoogleAttendance = (message, payload) => {
  logger.debug(`[GoogleAttendance] ${message}: ${JSON.stringify(payload)}`);
};

const isEmptyValue = (value) => {
  const normalized = normalizeCell(value).toLowerCase();
  return (
    !normalized ||
    ["-", "--", "na", "n/a", "null", "undefined"].includes(normalized)
  );
};

const normalizeDate = (value) => {
  const text = normalizeCell(value);
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (localMatch) {
    const [, day, month, rawYear] = localMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return text;
};

const getComparableEmployeeId = (value) => {
  const text = normalizeCell(value).toLowerCase();
  if (/^0+\d+$/.test(text)) return text.replace(/^0+/, "") || "0";
  return text;
};

const getEmployeeMapKeys = (value) => {
  const exact = normalizeCell(value).toLowerCase();
  const comparable = getComparableEmployeeId(value);
  return [...new Set([exact, comparable].filter(Boolean))];
};

const quoteSheetName = (sheetName) =>
  `'${String(sheetName).replace(/'/g, "''")}'`;

const boundOpenEndedRange = (range, recordLimit) =>
  String(range).replace(
    /(^|!)([A-Z]+):([A-Z]+)$/i,
    (_match, prefix, start, end) =>
      `${prefix}${start}1:${end}${recordLimit + 1}`,
  );

const buildSheetRange = ({ sheetName, range, recordLimit }) => {
  if (range && !sheetName) {
    return boundOpenEndedRange(range, recordLimit);
  }

  return `${quoteSheetName(sheetName)}!${DEFAULT_COLUMN_START}1:${DEFAULT_COLUMN_END}${recordLimit + 1}`;
};

const buildEmployeeMasterRange = (sheetName, recordLimit) =>
  buildSheetRange({
    sheetName:
      sheetName ||
      process.env.GOOGLE_EMPLOYEE_MASTER_SHEET_NAME ||
      DEFAULT_EMPLOYEE_MASTER_SHEET_NAME,
    range: process.env.GOOGLE_EMPLOYEE_MASTER_RANGE,
    recordLimit,
  });

const buildAttendanceLogRange = (sheetName, recordLimit) =>
  buildSheetRange({
    sheetName:
      sheetName ||
      process.env.GOOGLE_ATTENDANCE_LOG_SHEET_NAME ||
      process.env.GOOGLE_ATTENDANCE_SHEET_NAME ||
      DEFAULT_ATTENDANCE_LOG_SHEET_NAME,
    range:
      process.env.GOOGLE_ATTENDANCE_LOG_RANGE ||
      process.env.GOOGLE_ATTENDANCE_RANGE,
    recordLimit,
  });

const getCacheTtl = () => {
  const configured = Number.parseInt(
    process.env.GOOGLE_ATTENDANCE_CACHE_TTL_MS || "",
    10,
  );
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_CACHE_TTL_MS;
};

const getRecordLimit = (limit, fallback = DEFAULT_MAX_RECORDS) => {
  const configured = Number.parseInt(limit || "", 10);
  if (!Number.isFinite(configured) || configured <= 0) return fallback;
  return Math.min(configured, MAX_RECORD_CAP);
};

const getAttendanceRecordLimit = (limit) =>
  getRecordLimit(
    limit || process.env.GOOGLE_ATTENDANCE_MAX_RECORDS,
    DEFAULT_MAX_RECORDS,
  );

const getEmployeeMasterRecordLimit = () =>
  getRecordLimit(
    process.env.GOOGLE_EMPLOYEE_MASTER_MAX_RECORDS,
    DEFAULT_MASTER_MAX_RECORDS,
  );

const getSpreadsheetId = () => {
  const spreadsheetId =
    process.env.GOOGLE_ATTENDANCE_SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new AppError("Google attendance spreadsheet is not configured.", 503);
  }

  return spreadsheetId;
};

const getCredentialsPath = () => {
  const configuredPath =
    process.env.GOOGLE_SHEETS_CREDENTIALS_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "credentials.json";

  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, "..", configuredPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new AppError(
      "Google Sheets credentials.json file was not found.",
      503,
    );
  }

  return resolvedPath;
};

const getCredentials = () => {
  const inlineCredentials =
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!inlineCredentials) return null;

  try {
    return JSON.parse(inlineCredentials);
  } catch (error) {
    throw new AppError("Google Sheets service account JSON is invalid.", 503);
  }
};

const createSheetsClient = () => {
  if (process.env.GOOGLE_SHEETS_API_KEY) {
    return google.sheets({
      version: "v4",
      auth: process.env.GOOGLE_SHEETS_API_KEY,
    });
  }

  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    ...(credentials ? { credentials } : { keyFile: getCredentialsPath() }),
    scopes: [SHEETS_READONLY_SCOPE],
  });

  return google.sheets({ version: "v4", auth });
};

const getCachedResult = (cacheKey) => {
  const cached = cache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }

  return {
    ...cached.value,
    cached: true,
  };
};

const setCachedResult = (cacheKey, value) => {
  const ttlMs = getCacheTtl();
  if (ttlMs === 0) return;
  cache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
};

const parseTimeToMinutes = (value) => {
  const text = normalizeCell(value);
  if (isEmptyValue(text)) return null;

  const twentyFourHourMatch = text.match(
    /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/,
  );
  if (twentyFourHourMatch) {
    const [, rawHour, rawMinute] = twentyFourHourMatch;
    return Number.parseInt(rawHour, 10) * 60 + Number.parseInt(rawMinute, 10);
  }

  const twelveHourMatch = text.match(
    /^(0?\d|1[0-2])(?::([0-5]\d))?\s*(am|pm)$/i,
  );
  if (twelveHourMatch) {
    const [, rawHour, rawMinute = "0", period] = twelveHourMatch;
    let hour = Number.parseInt(rawHour, 10);
    if (period.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (period.toLowerCase() === "am" && hour === 12) hour = 0;
    return hour * 60 + Number.parseInt(rawMinute, 10);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}-\d{1,2}-\d{1,2}|T/.test(text)) {
    return parsed.getHours() * 60 + parsed.getMinutes();
  }

  return null;
};

const calculateShiftDurationMinutes = ({ checkIn, checkOut }) => {
  const inMinutes = parseTimeToMinutes(checkIn);
  const outMinutes = parseTimeToMinutes(checkOut);
  if (inMinutes === null || outMinutes === null) return null;

  const duration = outMinutes - inMinutes;
  return duration >= 0 ? duration : duration + 24 * 60;
};

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return "";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
};

const getOnDutyShiftScope = (value) => {
  const text = normalizeCell(value).toLowerCase();
  if (isEmptyValue(text)) return { shift1: false, shift2: false };

  const normalized = text.replace(/[^a-z0-9]+/g, " ").trim();
  const isOnDuty =
    ["od", "onduty", "yes", "y", "true", "1"].includes(normalized) ||
    /\bod\b/.test(normalized) ||
    normalized.includes("on duty") ||
    normalized.includes("official duty");

  if (!isOnDuty) return { shift1: false, shift2: false };

  const shift1 = /\b(1|s1|shift 1|first|morning)\b/.test(normalized);
  const shift2 = /\b(2|s2|shift 2|second|evening)\b/.test(normalized);
  const fullDay = !shift1 && !shift2;

  return {
    shift1: fullDay || shift1,
    shift2: fullDay || shift2,
  };
};

const getShiftResult = (shift, isOnDutyShift) => {
  // If marked as On Duty
  if (isOnDutyShift) {
    return {
      durationMinutes: null,
      workedHours: "",
      result: "OD",
    };
  }

  // Check if both checkIn and checkOut have valid values
  const checkInValid = !isEmptyValue(shift.checkIn);
  const checkOutValid = !isEmptyValue(shift.checkOut);

  // Calculate duration only for logging purposes
  const durationMinutes = calculateShiftDurationMinutes(shift);
  const workedHours = formatDuration(durationMinutes);

  // Shift-based validation: Both checkIn and checkOut must have values
  const result = checkInValid && checkOutValid ? "P" : "A";

  return {
    durationMinutes,
    workedHours,
    result,
  };
};

const getOverallStatus = (shift1Result, shift2Result) => {
  const pair = `${shift1Result}+${shift2Result}`;

  if (pair === "P+P") return "Present";
  if (pair === "A+A") return "Absent";
  if (pair === "OD+OD") return "On Duty";
  if (["P+OD", "OD+P"].includes(pair)) return "Present";
  if (["P+A", "A+P", "OD+A", "A+OD"].includes(pair)) return "Half Day";

  return "Absent";
};

const calculateAttendanceStatus = (
  {
    shift1CheckIn,
    shift1CheckOut,
    shift2CheckIn,
    shift2CheckOut,
    onDutyStatus,
  },
  employeeId = "UNKNOWN",
) => {
  const onDutyScope = getOnDutyShiftScope(onDutyStatus);
  const shift1 = getShiftResult(
    { checkIn: shift1CheckIn, checkOut: shift1CheckOut },
    onDutyScope.shift1,
  );
  const shift2 = getShiftResult(
    { checkIn: shift2CheckIn, checkOut: shift2CheckOut },
    onDutyScope.shift2,
  );
  const status = getOverallStatus(shift1.result, shift2.result);

  // Debug logging for attendance calculations
  logger.debug(`[Attendance Calculation] Employee: ${employeeId}`, {
    shift1CheckIn: shift1CheckIn,
    shift1CheckOut: shift1CheckOut,
    shift1DurationMinutes: shift1.durationMinutes,
    shift1WorkedHours: shift1.workedHours,
    shift1Result: shift1.result,
    shift2CheckIn: shift2CheckIn,
    shift2CheckOut: shift2CheckOut,
    shift2DurationMinutes: shift2.durationMinutes,
    shift2WorkedHours: shift2.workedHours,
    shift2Result: shift2.result,
    overallStatus: status,
    validationMethod:
      "Shift-based (checks if check-in and check-out values exist)",
  });

  return {
    shift1DurationMinutes: shift1.durationMinutes,
    shift1WorkedHours: shift1.workedHours,
    shift1Result: shift1.result,
    shift2DurationMinutes: shift2.durationMinutes,
    shift2WorkedHours: shift2.workedHours,
    shift2Result: shift2.result,
    status,
  };
};

const buildAnalytics = (records) => {
  const counts = records.reduce(
    (acc, record) => {
      acc.total += 1;
      if (record.status === "Present") acc.present += 1;
      if (record.status === "Absent") acc.absent += 1;
      if (record.status === "Half Day") acc.halfDay += 1;
      if (record.status === "On Duty") acc.onDuty += 1;
      return acc;
    },
    { total: 0, present: 0, absent: 0, halfDay: 0, onDuty: 0 },
  );

  return {
    ...counts,
    statusCounts: [
      { status: "Present", count: counts.present },
      { status: "Half Day", count: counts.halfDay },
      { status: "On Duty", count: counts.onDuty },
      { status: "Absent", count: counts.absent },
    ],
    checkInTrends: [],
  };
};

const getValuesByRange = (valueRanges, range, index) => {
  const rangeSheetName = range
    .split("!")[0]
    .replace(/^'|'$/g, "")
    .replace(/''/g, "'");
  const matched = valueRanges.find((valueRange) => {
    const returnedSheetName = String(valueRange.range || "")
      .split("!")[0]
      .replace(/^'|'$/g, "");
    return returnedSheetName === rangeSheetName;
  });

  return matched?.values || valueRanges[index]?.values || [];
};

const getRequiredIndex = (headers, key, sheetName, label) => {
  const index = findColumnIndex(headers, key);
  if (index < 0) {
    throw new AppError(
      `${sheetName} sheet must include a ${label} column.`,
      400,
    );
  }
  return index;
};

const parseEmployeeMaster = (values) => {
  if (!values.length) {
    throw new AppError("Employee_Master sheet is empty or unreadable.", 400);
  }

  const [headers, ...dataRows] = values;
  const indexes = {
    employeeId: getRequiredIndex(
      headers,
      "employeeId",
      "Employee_Master",
      "Emp ID",
    ),
    employeeName: getRequiredIndex(
      headers,
      "employeeName",
      "Employee_Master",
      "Employee Name",
    ),
    dateOfJoining: findColumnIndex(headers, "dateOfJoining"),
    designation: findColumnIndex(headers, "designation"),
    department: findColumnIndex(headers, "department"),
    position: findColumnIndex(headers, "position"),
  };

  const employeeById = new Map();
  const employees = [];
  let scannedRows = 0;

  dataRows.forEach((row, rowIndex) => {
    scannedRows += 1;
    const employeeId = getCell(row, indexes.employeeId);
    const name = getCell(row, indexes.employeeName);

    if ([employeeId, name].every(isEmptyValue)) return;
    if (isEmptyValue(employeeId)) return;

    const employee = {
      employeeId,
      name,
      dateOfJoining:
        normalizeDate(getCell(row, indexes.dateOfJoining)) || undefined,
      designation: getCell(row, indexes.designation),
      department: getCell(row, indexes.department),
      position: getCell(row, indexes.position),
      rowNumber: rowIndex + 2,
    };

    employees.push(employee);
    getEmployeeMapKeys(employeeId).forEach((key) => {
      if (!employeeById.has(key)) employeeById.set(key, employee);
    });
  });

  return { employees, employeeById, scannedRows };
};

const parseAttendanceLog = (values, requestedDate, recordLimit) => {
  if (!values.length) {
    throw new AppError("Attendance_Log sheet is empty or unreadable.", 400);
  }

  const [headers, ...dataRows] = values;
  debugGoogleAttendance("Attendance_Log raw headers", headers);
  debugGoogleAttendance("Attendance_Log raw rows", dataRows);

  const indexes = {
    employeeId: getRequiredIndex(
      headers,
      "employeeId",
      "Attendance_Log",
      "Emp ID",
    ),
    attendanceDate: getRequiredIndex(
      headers,
      "attendanceDate",
      "Attendance_Log",
      "Attendance Date",
    ),
    shift1CheckIn: findColumnIndex(headers, "shift1CheckIn"),
    shift1CheckOut: findColumnIndex(headers, "shift1CheckOut"),
    shift2CheckIn: findColumnIndex(headers, "shift2CheckIn"),
    shift2CheckOut: findColumnIndex(headers, "shift2CheckOut"),
    onDutyStatus: findColumnIndex(headers, "onDutyStatus"),
  };
  debugGoogleAttendance("Attendance_Log resolved column indexes", {
    headers,
    indexes,
    mappedColumns: Object.fromEntries(
      Object.entries(indexes).map(([key, index]) => [
        key,
        index >= 0 ? headers[index] : null,
      ]),
    ),
  });

  const logs = [];
  let scannedRows = 0;

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const row = dataRows[rowIndex];
    scannedRows += 1;
    debugGoogleAttendance("Attendance_Log raw row", {
      rowNumber: rowIndex + 2,
      row,
    });

    const log = {
      employeeId: getCell(row, indexes.employeeId),
      date: normalizeDate(getCell(row, indexes.attendanceDate)),
      shift1CheckIn: getCell(row, indexes.shift1CheckIn),
      shift1CheckOut: getCell(row, indexes.shift1CheckOut),
      shift2CheckIn: getCell(row, indexes.shift2CheckIn),
      shift2CheckOut: getCell(row, indexes.shift2CheckOut),
      onDutyStatus: getCell(row, indexes.onDutyStatus),
      rowNumber: rowIndex + 2,
    };
    debugGoogleAttendance("Attendance_Log parsed attendance object", log);

    if (
      [
        log.employeeId,
        log.date,
        log.shift1CheckIn,
        log.shift1CheckOut,
        log.shift2CheckIn,
        log.shift2CheckOut,
        log.onDutyStatus,
      ].every(isEmptyValue)
    )
      continue;
    if (requestedDate && log.date !== requestedDate) continue;

    logs.push(log);
    if (logs.length >= recordLimit) break;
  }

  return {
    logs,
    scannedRows,
    truncated: logs.length >= recordLimit,
  };
};

const createMissingEmployeeError = (log) => ({
  code: "EMPLOYEE_MASTER_RECORD_MISSING",
  message: `Employee_Master record not found for Emp ID ${log.employeeId || "(blank)"}.`,
  employeeId: log.employeeId,
  attendanceLogRowNumber: log.rowNumber,
});

const mapAttendanceLogToRecord = (log, employee) => {
  const calculated = calculateAttendanceStatus(log, log.employeeId);
  debugGoogleAttendance("Shift1 Duration", {
    rowNumber: log.rowNumber,
    employeeId: log.employeeId,
    durationMinutes: calculated.shift1DurationMinutes,
    workedHours: calculated.shift1WorkedHours,
  });
  debugGoogleAttendance("Shift1 Result", {
    rowNumber: log.rowNumber,
    employeeId: log.employeeId,
    result: calculated.shift1Result,
  });
  debugGoogleAttendance("Shift2 Duration", {
    rowNumber: log.rowNumber,
    employeeId: log.employeeId,
    durationMinutes: calculated.shift2DurationMinutes,
    workedHours: calculated.shift2WorkedHours,
  });
  debugGoogleAttendance("Shift2 Result", {
    rowNumber: log.rowNumber,
    employeeId: log.employeeId,
    result: calculated.shift2Result,
  });
  debugGoogleAttendance("Overall Status", {
    rowNumber: log.rowNumber,
    employeeId: log.employeeId,
    status: calculated.status,
  });
  debugGoogleAttendance("Shift calculation result", {
    rowNumber: log.rowNumber,
    employeeId: log.employeeId,
    shift1: {
      checkIn: log.shift1CheckIn,
      checkOut: log.shift1CheckOut,
      durationMinutes: calculated.shift1DurationMinutes,
      workedHours: calculated.shift1WorkedHours,
      result: calculated.shift1Result,
    },
    shift2: {
      checkIn: log.shift2CheckIn,
      checkOut: log.shift2CheckOut,
      durationMinutes: calculated.shift2DurationMinutes,
      workedHours: calculated.shift2WorkedHours,
      result: calculated.shift2Result,
    },
    onDutyStatus: log.onDutyStatus,
    overallStatus: calculated.status,
  });

  const record = {
    employeeId: employee?.employeeId || log.employeeId,
    name: employee?.name || "",
    department: employee?.department || "",
    position: employee?.position || "",
    designation: employee?.designation || "",
    dateOfJoining: employee?.dateOfJoining,
    checkIn: isEmptyValue(log.shift1CheckIn) ? "" : log.shift1CheckIn,
    checkOut: isEmptyValue(log.shift2CheckOut)
      ? log.shift1CheckOut
      : log.shift2CheckOut,
    shift1CheckIn: isEmptyValue(log.shift1CheckIn) ? "" : log.shift1CheckIn,
    shift1CheckOut: isEmptyValue(log.shift1CheckOut) ? "" : log.shift1CheckOut,
    shift1DurationMinutes: calculated.shift1DurationMinutes,
    shift1WorkedHours: calculated.shift1WorkedHours,
    shift2CheckIn: isEmptyValue(log.shift2CheckIn) ? "" : log.shift2CheckIn,
    shift2CheckOut: isEmptyValue(log.shift2CheckOut) ? "" : log.shift2CheckOut,
    shift2DurationMinutes: calculated.shift2DurationMinutes,
    shift2WorkedHours: calculated.shift2WorkedHours,
    shift1Result: calculated.shift1Result,
    shift2Result: calculated.shift2Result,
    onDutyStatus: log.onDutyStatus,
    status: calculated.status,
    date: log.date || undefined,
    rowNumber: log.rowNumber,
    mappingError: employee ? undefined : createMissingEmployeeError(log),
  };
  debugGoogleAttendance("Final attendance status", {
    rowNumber: log.rowNumber,
    employeeId: record.employeeId,
    shift1Duration: record.shift1WorkedHours,
    shift1Result: record.shift1Result,
    shift2Duration: record.shift2WorkedHours,
    shift2Result: record.shift2Result,
    status: record.status,
  });

  return record;
};

const mapAttendanceRecords = ({ logs, employeeById }) => {
  const seen = new Set();
  const records = [];
  const errors = [];

  logs.forEach((log) => {
    const employee = getEmployeeMapKeys(log.employeeId)
      .map((key) => employeeById.get(key))
      .find(Boolean);
    const dateKey = log.date || "no-date";
    const employeeKey =
      getComparableEmployeeId(log.employeeId) || `row-${log.rowNumber}`;
    const dedupKey = `${employeeKey}|${dateKey}`;

    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    const record = mapAttendanceLogToRecord(log, employee);
    if (record.mappingError) errors.push(record.mappingError);
    records.push(record);
  });

  return { records, errors };
};

class GoogleAttendanceService {
  async getAttendance({
    date,
    sheetName,
    employeeSheetName,
    attendanceSheetName,
    forceRefresh = false,
    limit,
  } = {}) {
    const spreadsheetId = getSpreadsheetId();
    const attendanceLimit = getAttendanceRecordLimit(limit);
    const employeeLimit = getEmployeeMasterRecordLimit();
    const employeeRange = buildEmployeeMasterRange(
      employeeSheetName,
      employeeLimit,
    );
    const attendanceRange = buildAttendanceLogRange(
      attendanceSheetName || sheetName,
      attendanceLimit,
    );
    const normalizedDate = normalizeDate(date);
    const cacheKey = JSON.stringify({
      spreadsheetId,
      employeeRange,
      attendanceRange,
      date: normalizedDate,
      attendanceLimit,
      employeeLimit,
    });

    if (!forceRefresh) {
      const cached = getCachedResult(cacheKey);
      if (cached) return cached;
    }

    try {
      const sheets = createSheetsClient();
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [employeeRange, attendanceRange],
      });

      const valueRanges = response.data.valueRanges || [];
      const employeeValues = getValuesByRange(valueRanges, employeeRange, 0);
      const attendanceValues = getValuesByRange(
        valueRanges,
        attendanceRange,
        1,
      );
      const transformed = this.transformSheets({
        employeeValues,
        attendanceValues,
        requestedDate: normalizedDate,
        recordLimit: attendanceLimit,
      });

      const result = {
        records: transformed.records,
        analytics: buildAnalytics(transformed.records),
        errors: transformed.errors,
        source: {
          spreadsheetId,
          range: attendanceRange,
          ranges: {
            employeeMaster: employeeRange,
            attendanceLog: attendanceRange,
          },
          fetchedAt: new Date().toISOString(),
          limit: attendanceLimit,
          employeeLimit,
          scannedRows: transformed.scannedRows,
          employeeScannedRows: transformed.employeeScannedRows,
          attendanceScannedRows: transformed.attendanceScannedRows,
          truncated: transformed.truncated,
          missingEmployeeCount: transformed.errors.length,
        },
        cached: false,
      };

      // Persist records to database asynchronously
      if (transformed.records.length > 0) {
        try {
          const AttendanceService = require("./attendance.service");
          const dataToSave = transformed.records.map((record) => ({
            employeeId: record.employeeId,
            date: record.date,
            shift1CheckIn: record.shift1CheckIn,
            shift1CheckOut: record.shift1CheckOut,
            shift1DurationMinutes: record.shift1DurationMinutes,
            shift1WorkedHours: record.shift1WorkedHours,
            shift1Result: record.shift1Result,
            shift2CheckIn: record.shift2CheckIn,
            shift2CheckOut: record.shift2CheckOut,
            shift2DurationMinutes: record.shift2DurationMinutes,
            shift2WorkedHours: record.shift2WorkedHours,
            shift2Result: record.shift2Result,
            onDutyStatus: record.onDutyStatus,
            overallStatus: record.status,
          }));

          // Save asynchronously without blocking response
          AttendanceService.bulkSaveShiftAttendance(dataToSave).catch(
            (error) => {
              logger.error(
                "[GoogleAttendance] Failed to persist records to database",
                {
                  error: error.message,
                  recordCount: dataToSave.length,
                },
              );
            },
          );
        } catch (error) {
          logger.error(
            "[GoogleAttendance] Error setting up database persistence",
            {
              error: error.message,
            },
          );
        }
      }

      setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "Unable to fetch Google Sheets attendance data.",
        502,
        [{ field: "googleSheets", message: error.message }],
      );
    }
  }

  transformSheets({
    employeeValues,
    attendanceValues,
    requestedDate,
    recordLimit = DEFAULT_MAX_RECORDS,
  }) {
    const employeeMaster = parseEmployeeMaster(employeeValues);
    const attendanceLog = parseAttendanceLog(
      attendanceValues,
      requestedDate,
      recordLimit,
    );
    const mapped = mapAttendanceRecords({
      logs: attendanceLog.logs,
      employeeById: employeeMaster.employeeById,
    });

    return {
      records: mapped.records,
      errors: mapped.errors,
      employeeScannedRows: employeeMaster.scannedRows,
      attendanceScannedRows: attendanceLog.scannedRows,
      scannedRows: attendanceLog.scannedRows,
      truncated: attendanceLog.truncated,
    };
  }
}

module.exports = new GoogleAttendanceService();
