# Push token capture — POC

Install this on a desktop, an Android phone and an iPhone; turn on
notifications; watch the token land on the server. That is the whole scope.

It is the first real consumer of `@shekharcylon/push-web`, so it doubles as
proof the package works outside the repo it was built in.

```bash
npm install
npm run dev        # http://localhost:3020
```

`postinstall` copies the service worker into `public/`. If you ever move or
upgrade the package, re-run `npx push-web install`.

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

**Proves:** the package installs and works in a fresh app; a real token can be
minted on all three platforms; the token reaches a server and is stored; a
re-registration updates the row instead of duplicating it.

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
