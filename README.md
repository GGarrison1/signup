# Collaborative Course Scheduler

A multi-user weekday course calendar. Volunteers enter their names and use a shared link; no accounts. An administrator password protects course settings, lecture topics, and blocked periods. Assignments are saved in a SQLite database and other browsers refresh every 3 seconds.

## Local setup

Requires Node.js 20 or newer. In this folder:

```bash
npm install
ADMIN_PASSWORD='your-long-unique-password' npm start
```

On Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD='your-long-unique-password'
npm start
```

Open http://localhost:3000. The password must be at least 12 characters. Do not put it in a shared link.

## Hosting and sharing

Deploy as a persistent Node.js web service with `npm install` as build command and `npm start` as start command. Configure `ADMIN_PASSWORD` as a secret environment variable. Set `DATA_DIR` to a **persistent disk** location, such as `/var/data`, and mount persistent storage there. Without persistent storage, the SQLite database can disappear after restarts or redeployments. Use HTTPS and a host that supports Node.js and persistent disks. Share the resulting HTTPS URL with volunteers. Do not deploy this application as a static-only site; the server is required.

## Behavior and limitations

- Weekdays only; 30-minute slot grid; lectures may last 30 or 60 minutes.
- Server validates date range, block restrictions, overlapping lectures and one assignment per topic.
- Concurrent edits use an atomic version check. Conflicting updates prompt the user to retry.
- Volunteers can move or remove **any** scheduled lecture, because no login or identity verification exists. Names are self-reported.
- Administrator access is password-based, transmitted over HTTPS; the browser retains the password only for the open tab. No account system.
- Refresh polling is every 3 seconds, not push-based instant updates.
- Back up the persistent SQLite file (including safe SQLite backup procedures) routinely.
- Browser compatibility: standards-based HTML/CSS/JavaScript and native drag-and-drop, with click-to-place/move fallback. Browser-by-browser manual QA remains necessary.
- This is an initial deployable implementation, not a security-audited production system. Add rate limiting, CSRF/origin controls and managed authentication if broader or sensitive deployment is planned.
