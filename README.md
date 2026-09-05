# Push token capture — POC

Install this on a desktop, an Android phone and an iPhone; turn on
notifications; watch the token land on the server. That is the whole scope.

Self-contained: no push library, no wrapper package. The only dependency is
the Firebase SDK, and it is loaded lazily.

```bash
npm install
npm run dev        # http://localhost:3020
```

---

## The three steps on the page

**1. Install the app.** Chrome on Android and desktop fires
`beforeinstallprompt`, so there is a real Install button. Safari never does —
iOS shows the manual Share → Add to Home Screen steps instead, because that is
the only route Apple offers *and* the only state in which it will grant push.

**2. Capture the token.** Permission, then Firebase mints a token, then the app
POSTs it to `/api/push/token`. The button is hidden entirely when
`support()` says push cannot work here — prompting in a Safari tab on iOS would
fail and spend the one permission request this origin ever gets.

**3. What the server stored.** Every device that has registered, across all your
test browsers and phones.

There is also a **Diagnostics** panel. It exists because testing push means
testing on a phone, where there is no console — so the page has to be able to
say why it will not work.

---

## Testing on a phone

Push needs a secure context. `localhost` qualifies; `192.168.1.x` does **not**,
so your LAN address will never work. Use a tunnel:

```bash
npx cloudflared tunnel --url http://localhost:3020
```

Open the `https://…trycloudflare.com` URL on the phone.

On **iOS** you must then add it to the Home Screen and open it from the icon.
In a Safari tab the notification button stays hidden — that is correct, not a
bug. iOS 16.4 or later.

---

## What it proves, and what it does not

**Proves:** a real token can be minted on all three platforms; the token
reaches a server and is stored; a re-registration updates the row instead of
duplicating it.

**Does not:** send anything. Sending is Engage's job — this POC only captures.
To send to a captured token, copy it from the page into the push console in
`../push-notification` and send from there.

---

## Notes on the implementation

**Devices are stored in `data/devices.json`.** Deliberately the simplest thing
that proves the loop. The real registry is `push_devices` in Engage, keyed by
`app_id` — the payload shape here matches, so the swap is a change of
implementation rather than of contract.

**Upsert is on the token, never on `deviceId`.** One browser profile is one
token. `refresh()` runs on every launch, so without this the list would look
like it was growing when it was only repeating itself.

**`deviceId` and `token` are kept separate.** The first is a stable per-browser
UUID; the second is a rotating delivery address. Storing both is what lets a
rotated token still be tied back to the same device.

**The register endpoint had to exist before the UI was worth testing.** The SDK
swallows a failed register by design, so tracking can never break the page —
which means a missing endpoint looks exactly like success: "Notifications are
on", and an empty database.

---

## Where the code lives

```
src/lib/push.ts       every push function — support, permission, token, refresh
src/lib/usePush.ts    the React binding
public/firebase-messaging-sw.js   the service worker
src/app/api/push/…    the endpoints the browser posts to
```

Four decisions in `push.ts` are load-bearing and easy to undo by accident:

**The worker is registered off the root scope**, at
`/firebase-cloud-messaging-push-scope`. Apps commonly register their own
root-scope worker, and some unregister whatever controls the page on boot.

**`waitForActive()` is used instead of `navigator.serviceWorker.ready`.** That
promise only resolves for the worker whose scope covers the current page, and
ours is scoped away from `/` on purpose — awaiting it hangs forever with no
error anywhere.

**`deviceId` and the token are separate values.** One identifies a browser over
time; the other is a delivery address that rotates. Both are sent.

**iPadOS reports a Mac user-agent**, so `isIOS()` checks touch points. Without
it an iPad reads as desktop and gets prompted for a permission it cannot grant.
