# Running the app on your iPhone (Expo)

If you see **"No usable data found"** when scanning the QR code, try the following.

## 1. Scan from inside Expo Go (not the Camera app)

- Open the **Expo Go** app on your iPhone (install from the App Store if needed).
- In Expo Go, go to the **Projects** tab.
- Tap **"Scan QR code"** and scan the QR code shown in your terminal.
- Do **not** use the iPhone’s built-in Camera app to scan the QR; it often can’t open `exp://` URLs and will show "No usable data found".

## 2. Same Wi‑Fi

- Your Mac and iPhone must be on the **same Wi‑Fi network**.
- If they’re on different networks (e.g. Mac on Ethernet, iPhone on Wi‑Fi guest), the phone can’t reach the dev server.

## 3. Use tunnel mode

If same Wi‑Fi doesn’t work or you’re on a strict network:

```bash
npm run start:tunnel
```

Then scan the **new** QR code from **inside Expo Go** (Projects → Scan QR code). Tunnel uses a public URL so the phone can connect without being on the same LAN.

## 4. Enter URL manually

In Expo Go (Projects), look for **"Enter URL manually"** and type the URL shown in the terminal (e.g. `exp://192.168.1.x:8081`). Use the exact URL from the terminal where you ran `npm start`.

---

**Note:** This project uses native modules (e.g. Bluetooth printing). For full functionality use a **development build** on the device (`npx expo run:ios` with the device connected, or install a build from EAS). Expo Go may run the JS bundle but some native features (like the printer) may not work in Expo Go.
