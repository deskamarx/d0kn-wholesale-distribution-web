# Release checklist — Phase 2 web (`2.2.0`)

Phase 1 remains live at `2.1.1` and the signed APK stays at `2.1.0`. Phase 2 is a web-only release; do not rebuild or replace the APK unless the owner explicitly asks for a new signed Android build.

## Web deploy verification

1. Confirm `.github/workflows/web-ci.yml` passes: `npm ci`, `npm run build`, production audit (advisories are reported but do not fail the job), and a `web-dist` artifact is produced from `dist/`.
2. Confirm `.github/workflows/deploy.yml` succeeds on `main`, then open `https://deskamarx.github.io/d0kn-wholesale-distribution-web/` in a fresh/incognito tab and hard-refresh once to bypass the service-worker cache.
3. Spot-check hash routes such as `#orders`, `#customers`, `#settings`, all three languages, an offline reload after the shell is cached, and the browser console for errors.
4. Do not publish from a local `dist/` if it differs from the CI artifact; the live site uses the GitHub Pages base path `/d0kn-wholesale-distribution-web/`.

## Version and CHANGELOG_ID bumps

- Bump `APP_VERSION` and `CHANGELOG_ID` in `src/lib/preferences.ts` for user-visible web changes. Use a unique value such as `2.1.2-phase1`; the app compares it with saved `lastChangelog` and shows the What's New dialog once. Never reuse an ID.
- Keep `package.json` `version` aligned with `APP_VERSION` for a web release.
- For an APK release, increment `versionCode` and set `versionName` in `android/app/build.gradle`, then keep `APK_VERSION` in `src/lib/preferences.ts` equal to that `versionName`. Reuse the same signing identity so installs upgrade cleanly.
- Release plumbing, workflow-only changes, and documentation edits do not require a user-facing bump unless behavior changes.

## APK signing verification

1. Prefer `.github/workflows/android-release.yml` with both `ANDROID_SIGNING_PROPERTIES_BASE64` (base64 of `android/signing.properties`, using `storeFile=keystore/ci-release.p12`) and `ANDROID_KEYSTORE_BASE64` (base64 of the matching `.p12`) set. Without them the artifact is **unsigned** and must not be distributed as an update to an existing signed install.
2. Inspect the produced APK:
   ```bash
   apksigner verify --verbose --print-certs app-release.apk
   # On Windows PowerShell:
   # Get-FileHash -Algorithm SHA256 .\app-release.apk
   ```
3. For a production build, the signer certificate SHA-256 must match the value recorded in `ANDROID.md` (`377b68f99a07d9ae7330a281230b14e7aeec9e30ec2447e158143dd5996092d8`). An unsigned or differently signed APK is not the official release identity.
4. Publish the `SHA256SUMS.txt` from the workflow artifact alongside the APK and confirm the downloaded file hash matches before installing.

## Backup and restore warning

Workspace data is local only: web `localStorage` and Android WebView storage are separate and do not sync. Export a JSON backup from **Settings** before clearing browser data, reinstalling, or replacing the APK. Restore replaces the current workspace, so verify the backup source and keep the file private because it contains business records.

## Phase independence

Phase 1 web and release plumbing (CI, Pages deploy, deep-link registration, and this checklist) does not depend on Phase 2. The Android workflow is manual/tag-gated (`v*-android`) for this app only, and it neither deploys the web app nor touches the electronics app. Phase 2 can use its own branch, tags, and release checks; do not trigger the Phase 1 Android tag for unrelated work.

## Phase 2 verification

1. Run `npm test` (parser, migration, sort, CSV, and period unit checks), `npm run build && npm run smoke`, and `npm run audit:check` locally. CI runs the unit checks before the Pages build; the weekly audit reports on production dependencies only.
2. Confirm all 16 hash routes render in English, Bengali, and Chinese, in light and dark themes, and at desktop/mobile widths. Check the record explorer sorting, saved views, bulk export, quick add, and voice summary on at least one module per domain.
3. Confirm the service worker cache is `d0kn-distribution-shell-v5` and that a hard refresh serves the new asset hashes. Old caches delete themselves on activation.
4. Confirm the APK file hash is unchanged: `B9ACDE4E6607BD5DC523ECD3B77C8AA7797B725061BAF8169EF5D6A7F83FCAB8`, size `4,605,979`.

## Rollback

If a Phase 2 deploy regresses, revert the web commit on `main` and let the Pages deploy workflow publish the previous `2.1.1` assets. Existing browser data is forward-compatible: Phase 2 migrates old state by filling `extras` defaults, and Phase 1 ignores `extras`, so no data restore is required for a web-only rollback. Never roll back by publishing an unsigned APK.
