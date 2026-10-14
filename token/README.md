# Device token service

This service replaces the Telegram OTP transport with registered Android devices. It does not read arbitrary SMS messages: a device opts into one pending login and Android displays its one-message consent UI.

## Run

```bash
cd token
cp .env.example .env
# Set three independent random secrets, then export the file's values.
set -a; source .env; set +a
npm start
```

For a phone on the same LAN, bind `TOKEN_HOST=0.0.0.0` and configure the Android app with the computer's LAN address. Use HTTPS through a trusted reverse proxy outside isolated local testing.

Register the device in the app, then queue a login:

```bash
curl -X POST http://127.0.0.1:3456/api/login-requests \
  -H 'Authorization: Bearer YOUR_OPERATOR_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"phone":"09123456789","reason":"initial-login"}'
```

The app must be open for this first test. It polls for the request, starts Android SMS User Consent, tells the backend it is ready, and submits the approved OTP. Completed accounts are encrypted at rest. Existing crawler clients can use `GET /assign/:workerId`, `POST /report-success`, and `POST /report-captcha`.
