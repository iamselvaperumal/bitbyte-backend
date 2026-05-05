# bitbyte-backend
# HRMS-backend

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
GOOGLE_ATTENDANCE_SHEET_NAME=Attendance
GOOGLE_ATTENDANCE_RANGE=Attendance!A:Z
GOOGLE_SHEETS_CREDENTIALS_PATH=credentials.json
GOOGLE_SHEETS_CREDENTIALS_JSON=
GOOGLE_ATTENDANCE_CACHE_TTL_MS=30000
```

`GOOGLE_SHEETS_API_KEY` and `GOOGLE_ATTENDANCE_RANGE` are optional. If
`GOOGLE_SHEETS_API_KEY` is missing, the backend uses
`GOOGLE_SHEETS_CREDENTIALS_JSON` or `credentials.json`. If
`GOOGLE_ATTENDANCE_RANGE` is missing, the backend reads
`GOOGLE_ATTENDANCE_SHEET_NAME!A:Z`.

The API reads headers such as `Employee ID`, `Employee Name`, `Check-In Time`,
`Check-Out Time`, and `Absent Status`.

Endpoint:

```http
GET /api/v1/attendance/google-sheet
GET /api/v1/attendance/google-sheet?date=2026-05-05
GET /api/v1/attendance/google-sheet?sheet=May%202026&refresh=true
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
GET /api/v1/leaves/:employeeId
GET /api/v1/leaves/requests
POST /api/v1/leaves/allocate
POST /api/v1/leaves/request
PUT /api/v1/leaves/approve
PUT /api/v1/leaves/reject
POST /api/v1/leaves/comp-off
```
