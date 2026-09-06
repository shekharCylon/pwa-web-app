# Reporting device tokens to Engage

This app captures an FCM token and relays it to Engage as a
`push_notification` event. Once it arrives, the person is a contact, the device
is reachable, and Engage → Campaigns → Push Notifications can send to them by
segment.

## 1. Get the app credentials

In Engage, `GET /api/v1/app-credentials` with your normal user token returns
the pair (it creates them on first read):

```json
{ "status": "success", "data": { "app_id": "app_…", "app_secret": "sk_live_…" } }
```

## 2. Put them in `.env.local`

```ini
ENGAGE_API_URL=http://localhost:8000
ENGAGE_APP_ID=app_…
ENGAGE_APP_SECRET=sk_live_…
ENGAGE_PUSH_EVENT=push_notification
ENGAGE_PUSH_ENVIRONMENT=stage
```

No `NEXT_PUBLIC_` prefix. These are read only by `src/lib/engage.ts`, which is
marked `server-only` and imported only by API routes — the secret never enters
a browser bundle. `npm run verify` asserts that, along with the payload shape.

Restart after editing: Next reads env at boot.

## 3. Check the wiring

`npm run dev`, open the app, and the first card tells you what it is connected
to. Not connected shows exactly which variables are missing.

## What happens on each launch

```
browser                      this app's server              Engage
───────                      ─────────────────              ──────
getToken()  ──────────────▶  POST /api/push/token
                             ├─ store locally
                             └─ POST /api/v1/events  ─────▶  resolve contact by email
                                  X-App-Id                    append the event
                                  X-App-Secret                mirror the token to push_devices
                             ◀─ { engage: { ok } } ◀────────  { success, profile_id }
◀── shows "in Engage" ──────
```

`refresh()` runs on every launch, not only on opt-in. Tokens rotate silently,
and a site that reports the first one and never again goes dark over a few
weeks with no error anywhere.

## The email is not optional

Engage resolves an event to a contact **by email** and rejects an event
without one. A token captured before you fill in the first card is stored here
and belongs to nobody: it cannot enter a segment, so no campaign will reach it.

The app does not hide this. It shows "not in Engage" on the device, says why,
and re-reports automatically the moment you save an email — the token is only
remembered as sent once Engage has actually taken it.

## Stage and prod are not interchangeable

A token is minted by one Firebase project and reachable only by credentials
from that same project. `ENGAGE_PUSH_ENVIRONMENT` must match the project this
app's `NEXT_PUBLIC_FIREBASE_*` config points at, or every send comes back
`SENDER_ID_MISMATCH` — a 403 meaning the tokens are healthy and the key is
wrong. Engage retires nothing on that error, and delivers nothing either.

## Sending a test

1. Engage → Campaigns → Push Notifications
2. Environment `stage`, segment "Everyone with a live device"
3. **Dry run** first — it validates every token against Firebase for real and
   returns the real errors without contacting anyone
4. Then Send

Accepted is not delivered. Web push has no delivery receipt and no open metric,
so a 200 means the push service took the message and nothing more. Clicking the
notification posts back through `/api/push/click`, which relays to Engage — that
click is the only other real signal this channel produces.
