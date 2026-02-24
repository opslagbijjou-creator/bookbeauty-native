# Payments: Mollie Connect (BookBeauty Platform)

Deze implementatie gebruikt **Mollie Connect (OAuth)** voor bedrijven (connected accounts) en de **Payments API** voor checkout en webhooks.

## Architectuur
- Bedrijf koppelt Mollie via `mollie-oauth-start` -> `mollie-oauth-callback`.
- Platform maakt betaling aan op connected account (OAuth access token).
- Platform fee wordt automatisch toegepast via `applicationFee` (standaard `8%`).
- Webhook verwerkt status idempotent.
- Refund endpoint doet partial/full refund en schrijft een breakdown weg.

## Firestore Schema

### `companies/{companyId}`
- `status`: `pending_review | approved | rejected` (aanbevolen voor moderation)
- `cancellationPolicy`:
  - `lateWindowHours` (default `24`)
  - `holdPercent` (default `15`)
  - `platformFeePercentRule` (default `8`)
- `mollie`:
  - `linked`: `boolean`
  - `model`: `"platform"` (OAuth + applicationFee)
  - `status`: `"linked" | "onboarding" | ...`
  - `organizationId`: `string`
  - `organizationName`: `string`
  - `accessTokenEncrypted?`: `string` (aanbevolen)
  - `refreshTokenEncrypted?`: `string` (aanbevolen)
  - `accessToken`: `string` (fallback als je nog geen encryptie opzet)
  - `refreshToken`: `string` (fallback)
  - `tokenExpiresAtMs`: `number`
  - `tokenExpiresAt`: `timestamp/date`
  - `scope`: `string`
  - `onboardingStatus`: `string`
  - `canReceivePayments`: `boolean`
  - `canReceiveSettlements`: `boolean`
  - `dashboardOnboardingUrl`: `string`

### `bookings/{bookingId}`
- basis:
  - `companyId`, `serviceId`, `customerId`
  - `amountCents` (aanbevolen; fallback op `servicePrice`)
- status:
  - `status`: `draft | pending_payment | paid | cancelled | refunded | failed`
  - `paymentStatus`: `pending_payment | paid | failed | canceled | refunded`
- mollie:
  - `molliePaymentId`
  - `mollie.paymentId`
  - `mollie.status`
  - `mollie.checkoutUrl`
  - `mollie.refundId`
  - `mollie.refundStatus`
  - `mollie.platformFeePercent`
  - `mollie.applicationFeeCents`
- breakdown:
  - `breakdown.holdCents`
  - `breakdown.platformKeptCents`
  - `breakdown.companyKeptCents`
  - `breakdown.refundedCents`

### `oauthStates/{stateId}` (TTL)
- `provider`: `"mollie" | "mollie-client-link"`
- `companyId`
- `actorUid`
- `createdAtMs`
- `expiresAtMs`
- `expiresAt` (gebruik dit veld voor Firestore TTL policy)
- `consumed`

## Security Notes
- Log nooit access tokens, refresh tokens, API keys of Authorization headers.
- `companies/{companyId}.mollie.accessToken/refreshToken` alleen server-side uitleesbaar maken met Firestore Rules.
- Expose nooit secrets aan frontend.
- Gebruik uitsluitend Netlify env vars voor:
  - OAuth credentials
  - platform API key (optioneel)
  - Firebase service account

## OAuth vs Onboarding Link
- **Pure OAuth (aanbevolen default)**:
  - `mollie-oauth-start` + `mollie-oauth-callback`
  - Beste keuze als bedrijf direct zelf toestemming geeft.
- **Client Link onboarding (optioneel)**:
  - `mollie-onboarding-link` met `createClientLink=true`
  - Handig als platform eerst een invite flow wil sturen.

## Frontend Integratie Notes

### Boek nu flow
1. Maak booking doc.
2. Call `/.netlify/functions/mollie-create-payment` met `{ bookingId }`.
3. Redirect gebruiker naar `checkoutUrl`.

### Return pagina `/pay/return`
1. Lees `bookingId` uit query.
2. Poll Firestore (`bookings/{bookingId}`) op `paymentStatus`.
3. Stop bij terminal status: `paid | failed | canceled`.

### Company settings
1. Klik “Connect Mollie”.
2. Call `/.netlify/functions/mollie-oauth-start` met `{ companyId }`.
3. Redirect naar `authUrl`.
4. Callback zet `linked=1` op `/settings/payments`.

## Netlify ENV (Production)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (secret) **of** `FIREBASE_SERVICE_ACCOUNT_BASE64` (secret)
- `APP_BASE_URL=https://www.bookbeauty.nl`
- `MOLLIE_WEBHOOK_URL=https://www.bookbeauty.nl/.netlify/functions/mollie-webhook`
- `MOLLIE_MODE=test` (of `live`)
- `MOLLIE_OAUTH_CLIENT_ID` (secret)
- `MOLLIE_OAUTH_CLIENT_SECRET` (secret)
- `MOLLIE_OAUTH_REDIRECT_URI=https://www.bookbeauty.nl/.netlify/functions/mollie-oauth-callback`
- `MOLLIE_API_KEY_PLATFORM` (optioneel; nodig voor client-link flow)

## Test Stappen (Mollie test mode)
1. Zet alle env vars en deploy.
2. Open `/.netlify/functions/payments-health` en check:
   - `oauthCore=true`
   - `mollieSdkInstalled=true`
   - `firebaseAdminInitOk=true`
3. Koppel een bedrijf via OAuth.
4. Maak booking en start payment via `mollie-create-payment`.
5. Betaal in test checkout.
6. Controleer webhook update in booking:
   - `paymentStatus=paid`
   - `mollie.status=paid`
7. Test late cancel refund via `mollie-refund`:
   - check `breakdown.*`
   - check `mollie.refundId`
