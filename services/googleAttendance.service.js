const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const EmployeeProfile = require('../models/EmployeeProfile.model');
const AppError = require('../utils/AppError');

const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const DEFAULT_SHEET_NAME = 'Attendance';
const DEFAULT_COLUMN_START = 'A';
const DEFAULT_COLUMN_END = 'Z';
const DEFAULT_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_MAX_RECORDS = 500;
const MAX_RECORD_CAP = 2000;

const cache = new Map();

const headerAliases = {
  employeeId: ['employeeid', 'empid', 'empcode', 'employee code', 'employee no', 'id'],
  name: ['employeename', 'name', 'fullname', 'employee'],
  department: ['department', 'dept'],
  checkIn: ['checkintime', 'checkin', 'in time', 'intime', 'signin', 'signintime'],
  checkOut: ['checkouttime', 'checkout', 'out time', 'outtime', 'signout', 'signouttime'],
  absent: ['absentstatus', 'absent', 'attendance status', 'status'],
  date: ['date', 'attendancedate', 'attendance date', 'day'],
};

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeCell = (value) => String(value ?? '').trim();

const normalizedAliases = Object.fromEntries(
  Object.entries(headerAliases).map(([key, aliases]) => [
    key,
    aliases.map(normalizeHeader),
  ])
);

const findColumnIndex = (headers, key) => {
  const aliases = normalizedAliases[key];
  const normalizedHeaders = headers.map(normalizeHeader);
  const exactMatch = normalizedHeaders.findIndex((header) => aliases.includes(header));
  if (exactMatch >= 0) return exactMatch;

  return normalizedHeaders.findIndex((header) =>
    aliases.some((alias) => alias.length > 3 && header.includes(alias))
  );
};

const getCell = (row, index) => (index >= 0 ? normalizeCell(row[index]) : '');

const isEmptyValue = (value) => {
  const normalized = normalizeCell(value).toLowerCase();
  return !normalized || ['-', '--', 'na', 'n/a', 'null', 'undefined'].includes(normalized);
};

const isAbsentMarked = (value) => {
  const normalized = normalizeCell(value).toLowerCase();
  if (isEmptyValue(normalized)) return false;
  return ['absent', 'a', 'yes', 'y', 'true', '1'].includes(normalized) || normalized.includes('absent');
};

const determineStatus = ({ checkIn, absent }) => {
  if (isAbsentMarked(absent)) return 'absent';
  if (!isEmptyValue(checkIn)) return 'present';
  return 'not_marked';
};

const normalizeDate = (value) => {
  const text = normalizeCell(value);
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (localMatch) {
    const [, day, month, rawYear] = localMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return text;
};

const getComparableEmployeeId = (value) => {
  const text = normalizeCell(value).toLowerCase();
  if (/^0+\d+$/.test(text)) return text.replace(/^0+/, '') || '0';
  return text;
};

const getEmployeeMapKeys = (value) => {
  const exact = normalizeCell(value).toLowerCase();
  const comparable = getComparableEmployeeId(value);
  return [...new Set([exact, comparable].filter(Boolean))];
};

const quoteSheetName = (sheetName) => `'${String(sheetName).replace(/'/g, "''")}'`;

const boundOpenEndedRange = (range, recordLimit) =>
  String(range).replace(/(^|!)([A-Z]+):([A-Z]+)$/i, (_match, prefix, start, end) => (
    `${prefix}${start}1:${end}${recordLimit + 1}`
  ));

const buildRange = (sheetName, recordLimit) => {
  if (process.env.GOOGLE_ATTENDANCE_RANGE && !sheetName) {
    return boundOpenEndedRange(process.env.GOOGLE_ATTENDANCE_RANGE, recordLimit);
  }

  const resolvedSheetName =
    sheetName || process.env.GOOGLE_ATTENDANCE_SHEET_NAME || DEFAULT_SHEET_NAME;

  return `${quoteSheetName(resolvedSheetName)}!${DEFAULT_COLUMN_START}1:${DEFAULT_COLUMN_END}${recordLimit + 1}`;
};

const getCacheTtl = () => {
  const configured = Number.parseInt(process.env.GOOGLE_ATTENDANCE_CACHE_TTL_MS || '', 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CACHE_TTL_MS;
};

const getRecordLimit = (limit) => {
  const configured = Number.parseInt(limit || process.env.GOOGLE_ATTENDANCE_MAX_RECORDS || '', 10);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_RECORDS;
  return Math.min(configured, MAX_RECORD_CAP);
};

const getSpreadsheetId = () => {
  const spreadsheetId =
    process.env.GOOGLE_ATTENDANCE_SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new AppError('Google attendance spreadsheet is not configured.', 503);
  }

  return spreadsheetId;
};

const getCredentialsPath = () => {
  const configuredPath =
    process.env.GOOGLE_SHEETS_CREDENTIALS_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    'credentials.json';

  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new AppError('Google Sheets credentials.json file was not found.', 503);
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
    throw new AppError('Google Sheets service account JSON is invalid.', 503);
  }
};

const createSheetsClient = () => {
  if (process.env.GOOGLE_SHEETS_API_KEY) {
    return google.sheets({
      version: 'v4',
      auth: process.env.GOOGLE_SHEETS_API_KEY,
    });
  }

  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    ...(credentials ? { credentials } : { keyFile: getCredentialsPath() }),
    scopes: [SHEETS_READONLY_SCOPE],
  });

  return google.sheets({ version: 'v4', auth });
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

const buildCheckInBucket = (value) => {
  const text = normalizeCell(value);
  if (isEmptyValue(text)) return null;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}-\d{1,2}-\d{1,2}|T/.test(text)) {
    return `${String(parsed.getHours()).padStart(2, '0')}:00`;
  }

  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number.parseInt(match[1], 10);
  const period = match[3]?.toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;

  return `${String(hour).padStart(2, '0')}:00`;
};

const buildAnalytics = (records) => {
  const counts = records.reduce(
    (acc, record) => {
      acc.total += 1;
      if (record.status === 'present') acc.present += 1;
      if (record.status === 'absent') acc.absent += 1;
      if (record.status === 'not_marked') acc.notMarked += 1;
      return acc;
    },
    { total: 0, present: 0, absent: 0, notMarked: 0 }
  );

  const checkInBuckets = new Map();
  records.forEach((record) => {
    const bucket = buildCheckInBucket(record.checkIn);
    if (!bucket) return;
    checkInBuckets.set(bucket, (checkInBuckets.get(bucket) || 0) + 1);
  });

  return {
    ...counts,
    statusCounts: [
      { status: 'Present', count: counts.present },
      { status: 'Absent', count: counts.absent },
      { status: 'Not Marked', count: counts.notMarked },
    ],
    checkInTrends: [...checkInBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => ({ time, count })),
  };
};

class GoogleAttendanceService {
  async getAttendance({ date, sheetName, forceRefresh = false, limit } = {}) {
    const spreadsheetId = getSpreadsheetId();
    const recordLimit = getRecordLimit(limit);
    const range = buildRange(sheetName, recordLimit);
    const normalizedDate = normalizeDate(date);
    const cacheKey = JSON.stringify({ spreadsheetId, range, date: normalizedDate, limit: recordLimit });

    if (!forceRefresh) {
      const cached = getCachedResult(cacheKey);
      if (cached) return cached;
    }

    try {
      const sheets = createSheetsClient();
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = response.data.values || [];
      const { records, scannedRows, truncated } = await this.transformRows(values, normalizedDate, recordLimit);

      const result = {
        records,
        analytics: buildAnalytics(records),
        source: {
          spreadsheetId,
          range,
          fetchedAt: new Date().toISOString(),
          limit: recordLimit,
          scannedRows,
          truncated,
        },
        cached: false,
      };

      setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Unable to fetch Google Sheets attendance data.', 502, [
        { field: 'googleSheets', message: error.message },
      ]);
    }
  }

  async transformRows(values, requestedDate, recordLimit = DEFAULT_MAX_RECORDS) {
    if (!values.length) return { records: [], scannedRows: 0, truncated: false };

    const [headers, ...dataRows] = values;
    const indexes = {
      employeeId: findColumnIndex(headers, 'employeeId'),
      name: findColumnIndex(headers, 'name'),
      department: findColumnIndex(headers, 'department'),
      checkIn: findColumnIndex(headers, 'checkIn'),
      checkOut: findColumnIndex(headers, 'checkOut'),
      absent: findColumnIndex(headers, 'absent'),
      date: findColumnIndex(headers, 'date'),
    };

    if (indexes.employeeId < 0 && indexes.name < 0) {
      throw new AppError('Google attendance sheet must include Employee ID or Employee Name headers.', 400);
    }

    const seen = new Set();
    const records = [];
    let scannedRows = 0;

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      scannedRows += 1;

      const employeeId = getCell(row, indexes.employeeId);
      const name = getCell(row, indexes.name);
      const checkIn = getCell(row, indexes.checkIn);
      const checkOut = getCell(row, indexes.checkOut);
      const absent = getCell(row, indexes.absent);
      const rowDate = getCell(row, indexes.date);
      const department = getCell(row, indexes.department);

      if (![employeeId, name, checkIn, checkOut, absent, rowDate, department].some((value) => !isEmptyValue(value))) {
        continue;
      }

      const normalizedRowDate = normalizeDate(rowDate);
      if (requestedDate && indexes.date >= 0 && normalizedRowDate !== requestedDate) {
        continue;
      }

      const dateKey = normalizedRowDate || 'no-date';
      const dedupKey = `${employeeId.toLowerCase()}|${dateKey}`;

      if (seen.has(dedupKey)) {
        continue;
      }
      seen.add(dedupKey);

      records.push({
        employeeId,
        name,
        department,
        checkIn: isEmptyValue(checkIn) ? '' : checkIn,
        checkOut: isEmptyValue(checkOut) ? '' : checkOut,
        status: determineStatus({ checkIn, absent }),
        date: normalizedRowDate || undefined,
        rowNumber: rowIndex + 2,
      });

      if (records.length >= recordLimit) break;
    }

    return {
      records: await this.enrichWithEmployeeProfiles(records),
      scannedRows,
      truncated: records.length >= recordLimit,
    };
  }

  async enrichWithEmployeeProfiles(records) {
    const employeeIds = [...new Set(records.map((record) => record.employeeId).filter(Boolean))];
    if (!employeeIds.length) return records;

    const employeeIdQueryValues = [...new Set(employeeIds.flatMap((employeeId) => [
      employeeId,
      ...getEmployeeMapKeys(employeeId),
    ]))];

    const profiles = await EmployeeProfile.find({
      employeeId: { $in: employeeIdQueryValues },
      isDeleted: false,
    })
      .populate('userId', 'firstName lastName email')
      .select('employeeId department position userId')
      .lean();

    const profileByEmployeeId = new Map();
    profiles.forEach((profile) => {
      getEmployeeMapKeys(profile.employeeId).forEach((key) => {
        profileByEmployeeId.set(key, profile);
      });
    });

    return records
      .map((record) => {
        const profile = getEmployeeMapKeys(record.employeeId)
          .map((key) => profileByEmployeeId.get(key))
          .find(Boolean);

        // Unauthorized/Unrecognized employee: do not show in application
        if (!profile) return null;

        const profileName = `${profile.userId?.firstName || ''} ${profile.userId?.lastName || ''}`.trim();

        return {
          ...record,
          name: record.name || profileName,
          email: profile.userId?.email,
          department: record.department || profile.department || '',
          position: profile.position,
        };
      })
      .filter(Boolean);
  }
}

module.exports = new GoogleAttendanceService();
