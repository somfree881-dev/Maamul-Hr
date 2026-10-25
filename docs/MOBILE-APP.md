# Installable mobile app and dark mode

Maamul HR includes a web app manifest, 192/512 PNG icons, a maskable icon, standalone mode and mobile Home/Employee/Attendance/Payroll/Reports navigation. Navigation respects module permissions; server/API/RLS authorization remains unchanged. The moon/sun control switches themes and saves only the theme preference in localStorage. On a first visit, the app follows the device color scheme.

Deploy the existing Next.js server to an HTTPS origin before installing on a real phone. Set `APP_URL` to that origin and update Supabase Auth redirect settings. HTTP localhost supports desktop development, but opening a LAN IP over plain HTTP on a phone is not a production install setup. This change does not publish a website or create a public download URL.

- Android / Chrome: tap **Install app**, or use browser menu → Install app / Add to Home screen.
- iPhone / Safari: Share → Add to Home Screen → Add.
- Desktop Chrome/Edge: use **Install app** or the browser's install control when available.

Installation availability depends on the browser, HTTPS and device policies. A help dialog explains the browser-specific steps when a native install prompt is unavailable. Installed apps use the same sign-in, company isolation and permissions as the website.

The service worker caches only the public offline message and app icon. Authenticated HTML, Next.js data responses, API responses, private documents and employee/payroll records are never put into service-worker caches. Database workflows require an internet connection; offline writes are not queued. The Windows ZKTeco connector remains separate and retains its existing durable attendance queue. Offline app installation does not turn the phone into a fingerprint connector.

Use `npm.cmd run build` then `npm.cmd run start` for PWA testing. Development mode does not register a new service worker. In browser DevTools → Application, inspect Manifest, Service Workers and Cache Storage. The cache `maamul-public-v1` should contain only `/offline.html` and `/app-icon.svg`.
