const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const EmployeeProfile = require('../models/EmployeeProfile.model');
const AppError = require('../utils/AppError');

const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const DEFAULT_SHEET_NAME = 'Attendance';
const DEFAULT_COLUMN_RANGE = 'A:Z';
const DEFAULT_CACHE_TTL_MS = 30 * 1000;

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

const buildRange = (sheetName) => {
  if (process.env.GOOGLE_ATTENDANCE_RANGE && !sheetName) {
    return process.env.GOOGLE_ATTENDANCE_RANGE;
  }

  const resolvedSheetName =
    sheetName || process.env.GOOGLE_ATTENDANCE_SHEET_NAME || DEFAULT_SHEET_NAME;

  return `${quoteSheetName(resolvedSheetName)}!${DEFAULT_COLUMN_RANGE}`;
};

const getCacheTtl = () => {
  const configured = Number.parseInt(process.env.GOOGLE_ATTENDANCE_CACHE_TTL_MS || '', 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CACHE_TTL_MS;
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

  if (!inlineCredentials) {
    console.error("DEBUG: inlineCredentials is empty or undefined. Type:", typeof process.env.GOOGLE_SHEETS_CREDENTIALS_JSON);
    return null;
  }

  try {
    return JSON.parse(inlineCredentials);
  } catch (error) {
    console.error("DEBUG: JSON.parse failed. Content preview:", inlineCredentials.substring(0, 20));
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
  async getAttendance({ date, sheetName, forceRefresh = false } = {}) {
    const spreadsheetId = getSpreadsheetId();
    const range = buildRange(sheetName);
    const normalizedDate = normalizeDate(date);
    const cacheKey = JSON.stringify({ spreadsheetId, range, date: normalizedDate });

    if (!forceRefresh) {
      const cached = getCachedResult(cacheKey);
      if (cached) return cached;
    }

    try {
      const sheets = createSheetsClient();
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = response.data.values || [];
      const records = await this.transformRows(values, normalizedDate);

      const result = {
        records,
        analytics: buildAnalytics(records),
        source: {
          spreadsheetId,
          range,
          fetchedAt: new Date().toISOString(),
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

  async transformRows(values, requestedDate) {
    if (!values.length) return [];

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
    const records = dataRows
      .map((row, rowIndex) => {
        const employeeId = getCell(row, indexes.employeeId);
        const name = getCell(row, indexes.name);
        const checkIn = getCell(row, indexes.checkIn);
        const checkOut = getCell(row, indexes.checkOut);
        const absent = getCell(row, indexes.absent);
        const rowDate = getCell(row, indexes.date);
        const department = getCell(row, indexes.department);

        if (![employeeId, name, checkIn, checkOut, absent, rowDate, department].some((value) => !isEmptyValue(value))) {
          return null;
        }

        const normalizedRowDate = normalizeDate(rowDate);
        if (requestedDate && indexes.date >= 0 && normalizedRowDate !== requestedDate) {
          return null;
        }

        // Deduplication: only allow one entry per employee per date
        // Note: normalizedRowDate might be undefined if date column is missing, 
        // in which case we fallback to a generic key.
        const dateKey = normalizedRowDate || 'no-date';
        const dedupKey = `${employeeId.toLowerCase()}|${dateKey}`;
        
        if (seen.has(dedupKey)) {
          return null;
        }
        seen.add(dedupKey);

        return {
          employeeId,
          name,
          department,
          checkIn: isEmptyValue(checkIn) ? '' : checkIn,
          checkOut: isEmptyValue(checkOut) ? '' : checkOut,
          status: determineStatus({ checkIn, absent }),
          date: normalizedRowDate || undefined,
          rowNumber: rowIndex + 2,
        };
      })
      .filter(Boolean);

    return this.enrichWithEmployeeProfiles(records);
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

    return records.map((record) => {
      const profile = getEmployeeMapKeys(record.employeeId)
        .map((key) => profileByEmployeeId.get(key))
        .find(Boolean);

      if (!profile) return record;

      const profileName = `${profile.userId?.firstName || ''} ${profile.userId?.lastName || ''}`.trim();

      return {
        ...record,
        name: record.name || profileName,
        email: profile.userId?.email,
        department: record.department || profile.department || '',
        position: profile.position,
      };
    });
  }
}

module.exports = new GoogleAttendanceService();
