# Pilot Hardening Checklist

Use this checklist before distributing the Android pilot.

## QA Matrix

- [ ] Android 10 physical device smoke test
- [ ] Android 12 emulator smoke test
- [ ] Android 14 physical device smoke test
- [ ] Login, refresh, and logout reliability verified
- [ ] Unauthorized flow redirects to login

## Core Journeys

- [ ] Load dashboard and navigate to all pilot modules
- [ ] Load clients/projects/tasks lists with valid account
- [ ] Read notifications and deep-link to target route
- [ ] Validate attachment shell and backend route access

## Resilience

- [ ] Network loss while fetching list does not crash app
- [ ] Refresh token failure forces safe sign-out
- [ ] App relaunch restores valid session from secure storage

## Observability

- [ ] Error telemetry receives auth/API failures
- [ ] Pilot release build metadata captured
- [ ] Support runbook shared with pilot users

## Internal Distribution

- [ ] Build internal APK (`eas build --platform android --profile pilot`)
- [ ] Share to pilot group with release notes
- [ ] Collect feedback/issues and triage within 24 hours

