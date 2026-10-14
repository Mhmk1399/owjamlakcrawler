# Owj OTP Companion (Android)

Native Kotlin test application for the device token service in `../token`. It deliberately does **not** request `READ_SMS` or `RECEIVE_SMS`. Android's SMS User Consent API exposes one OTP message only after the employee approves the system dialog.

## Build

Open this directory in Android Studio (JDK 17), allow Gradle sync, and run `app` on a physical Android phone with Google Play services. The project allows cleartext HTTP only to make same-LAN testing simple; production builds must use HTTPS and disable `usesCleartextTraffic`.

## Test flow

1. Start the backend described in `../token/README.md` with `TOKEN_HOST=0.0.0.0`.
2. Put the computer and phone on the same trusted network and allow the backend port through the local firewall.
3. Enter `http://COMPUTER_LAN_IP:3456`, the SIM's phone number, and the enrollment key.
4. Tap **Register this device**, then **Start waiting for login requests**.
5. Queue the login using the backend command in `../token/README.md`.
6. Keep the app visible. It starts listening before the backend asks Divar to send the OTP.
7. Approve Android's one-message dialog. The backend completes login and stores the resulting account encrypted.

If consent delivery fails, the employee can enter the OTP in the manual fallback field while the request is active.

This first version intentionally polls while the activity is open. A later production version should add authenticated push notifications (FCM), device-key attestation, certificate pinning, and managed-device distribution rather than a permanent background SMS listener.
