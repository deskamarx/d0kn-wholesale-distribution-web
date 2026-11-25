# D0K@N Global Distribution — Android release

The Android app is a native Capacitor wrapper around the complete local-first distribution workspace. All 16 modules, English/Bengali/Chinese language support, the intelligence engine, adaptive layouts, and local JSON backup/restore are bundled inside the APK. No web server is required to open or use the app.

## Release details

| Item | Value |
| --- | --- |
| App name | D0K@N Global |
| Application ID / package | `io.d0kn.wholesale` |
| Version | `2.0.0` (`versionCode 1`) |
| Minimum Android | 7.0 / API 24 |
| Target / compile SDK | Android 16 / API 36 |
| Signing | APK Signature Scheme v2, RSA 2048 |
| Certificate | `CN=D0K@N Global Distribution, OU=Operations, O=D0K@N, L=Dhaka, ST=Dhaka, C=BD` |
| SHA-256 certificate digest | `377b68f99a07d9ae7330a281230b14e7aeec9e30ec2447e158143dd5996092d8` |
| Built APK | `release/D0KN-Global-Distribution-v2.0.0-signed.apk` |

## Install

Copy the APK to an Android 7+ device, allow **Install unknown apps** for the file manager/browser, and open it. Or connect the device/emulator and run:

```bash
adb install -r release/D0KN-Global-Distribution-v2.0.0-signed.apk
```

## Rebuild the signed APK

```bash
npm install
npm run build:android
cd android
gradlew.bat assembleRelease
```

The signed output is written to `android/app/build/outputs/apk/release/app-release.apk`.

`android/signing.properties` and `android/keystore/` are intentionally ignored by Git. To keep future updates installable over this release, preserve the same keystore and alias. A template is provided at `android/signing.properties.example`.

To regenerate branded launcher icons and splash screens from `public/icon.svg`:

```bash
npm run assets:android
```

## Data behaviour

Workspace records remain in the Android app's private WebView storage. The app does not require network access at launch, and all intelligence signals are calculated on-device. Use **Settings → Export backup / Restore backup** to move data between devices; the web and Android versions use different browser storage areas and do not sync automatically.
