# Abcotronics ERP Mobile (React Native)

Android pilot app for core ERP workflows.

## Quick Start

1. Install dependencies:
   - `cd mobile-rn`
   - `npm install`
2. Copy env template:
   - `cp .env.example .env`
3. Start Metro:
   - `npm run start`
4. Run Android:
   - `npm run android`

## Pilot Scope (Current)

- Authentication with mobile token refresh.
- Dashboard shell navigation.
- CRM clients (list).
- Projects and tasks (list).
- Notification center (list + refresh).
- Basic attachment upload shell.

## Backend Requirement

Point `EXPO_PUBLIC_API_BASE_URL` to the existing ERP backend, for example:

`https://abcoafrica.co.za`

