# bitbyte-backend
# HRMS-backend

## Swagger API Documentation

The backend serves Swagger UI and the raw OpenAPI spec without extra npm
dependencies:

```http
GET /api-docs
GET /api-docs/openapi.json
```

Run the backend and open `http://localhost:5000/api-docs` to browse the API,
authorize with a JWT bearer token, and test protected endpoints.

## Google Sheets Attendance

The attendance integration supports two read-only auth modes.

Option 1: API key. This works only when the Google Sheet is public or shared as
`Anyone with the link can view`.

Option 2: service account. Place your Google service account key at
`backend/credentials.json`, or set `GOOGLE_SHEETS_CREDENTIALS_PATH` to another
path. For deployed environments, paste the full service account JSON into
`GOOGLE_SHEETS_CREDENTIALS_JSON` instead of uploading `credentials.json`.
Share the attendance sheet with the service account email.

Required environment variables:

```env
GOOGLE_SHEETS_API_KEY=your_google_sheets_api_key
GOOGLE_ATTENDANCE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_EMPLOYEE_MASTER_SHEET_NAME=Employee_Master
GOOGLE_ATTENDANCE_LOG_SHEET_NAME=Attendance_Log
GOOGLE_EMPLOYEE_MASTER_RANGE=Employee_Master!A:Z
GOOGLE_ATTENDANCE_LOG_RANGE=Attendance_Log!A:Z
GOOGLE_SHEETS_CREDENTIALS_PATH=credentials.json
GOOGLE_SHEETS_CREDENTIALS_JSON=
GOOGLE_ATTENDANCE_CACHE_TTL_MS=30000
```

`GOOGLE_SHEETS_API_KEY`, `GOOGLE_EMPLOYEE_MASTER_RANGE`, and
`GOOGLE_ATTENDANCE_LOG_RANGE` are optional. If
`GOOGLE_SHEETS_API_KEY` is missing, the backend uses
`GOOGLE_SHEETS_CREDENTIALS_JSON` or `credentials.json`. If
the range variables are missing, the backend reads
`Employee_Master!A:Z` and `Attendance_Log!A:Z`. The legacy
`GOOGLE_ATTENDANCE_SHEET_NAME` and `GOOGLE_ATTENDANCE_RANGE` variables are still
accepted as fallbacks for the attendance log tab.

The API now reads two tabs in the same spreadsheet:

- `Employee_Master`: `Emp ID`, `Employee Name`, `Date of Joining`,
  `Designation`, `Department`, `Position`
- `Attendance_Log`: `Emp ID`, `Attendance Date`, `Shift 1 Check-In`,
  `Shift 1 Check-Out`, `Shift 2 Check-In`, `Shift 2 Check-Out`,
  `On Duty Status`

Attendance rows are joined to employee records by `Emp ID`; names and employee
details are always populated from `Employee_Master`.

Endpoint:

```http
GET /api/v1/attendance/google-sheet
GET /api/v1/attendance/google-sheet?date=2026-05-05
GET /api/v1/attendance/google-sheet?sheet=Attendance_Log&refresh=true
GET /api/v1/attendance/google-sheet?employeeSheet=Employee_Master&attendanceSheet=Attendance_Log
```

## Leave Management

Optional policy environment variables:

```env
LEAVE_EARNED_DAYS=15
LEAVE_CASUAL_DAYS=8
LEAVE_SICK_DAYS=8
LEAVE_MATERNITY_DAYS=182
LEAVE_PATERNITY_DAYS=15
LEAVE_COMP_OFF_VALIDITY_DAYS=30
LEAVE_PUBLIC_HOLIDAYS=2026-01-26,2026-08-15,2026-10-02
```

Leave APIs:

```http
GET /api/v1/leaves/all
GET /api/v1/leaves/me
GET /api/v1/leaves/:employeeId
GET /api/v1/leaves/requests
POST /api/v1/leaves/allocate
POST /api/v1/leaves/mark
POST /api/v1/leaves/request
PUT /api/v1/leaves/approve
PUT /api/v1/leaves/reject
POST /api/v1/leaves/comp-off
```
# HRMS-backend
