# openGym rest-push relay

A Cloudflare Worker that sends the "rest over" notification to a locked iPhone. The app hands it
the moment a rest ends; a Durable Object alarm fires then and sends an empty Web Push, which the
app's service worker turns into the notification. Free Cloudflare plan is enough.

What it keeps: the phone's push address and one timestamp, until the alarm fires or the rest is
cancelled. It only accepts requests from `ALLOWED_ORIGIN`, only real push-service addresses, and
only times within the next hour.

## One-time setup

```sh
npx wrangler@4 login     # opens Cloudflare in the browser; approve it
npx wrangler@4 deploy    # first time: pick a workers.dev subdomain; prints the Worker URL
npm run keys             # makes the VAPID key pair, stores it as secrets, prints the public key
```

Then put the URL and the public key into `.github/workflows/pages.yml` as `VITE_REST_PUSH_URL`
and `VITE_REST_PUSH_KEY`, push, and switch on Settings → Notifications → Rest alerts when locked
in the home-screen app.

`npm test` runs the relay's tests (Node 20+). `npm run keys` again makes a new key pair; every
phone then has to switch the alerts off and on again.
