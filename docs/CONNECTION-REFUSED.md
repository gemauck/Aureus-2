# Localhost Refused to Connect / ERR_CONNECTION_REFUSED

When you see **"localhost refused to connect"** or **ERR_CONNECTION_REFUSED**, the browser cannot reach the app because nothing is listening on that host and port.

## Fix: Start the backend server

1. **Start the server**
   ```bash
   npm run dev:backend
   ```
   You should see something like:
   ```
   🚀 Railway Server running on port 3000
   ```

2. **Open the app in your browser**
   - Default: **http://localhost:3000**
   - If you use a different `PORT` in `.env`, use **http://localhost:&lt;PORT&gt;** (the port shown when the server starts).

3. **Use the same URL**
   - The app and API use the same origin. Always open the app at the URL where the server is running (e.g. `http://localhost:3000`), not a different port or `file://`.

## If it still fails

- **Checking the connection**  
  Confirm the terminal shows “Server running on port …” and that you’re opening that exact `http://localhost:<port>` in the browser.

- **Checking the proxy**  
  If you use a proxy or VPN, try without it, or ensure it isn’t blocking localhost.

- **Checking the firewall**  
  Allow Node / your terminal app to accept inbound connections on the port (e.g. 3000).

- **Wrong port**  
  If `PORT` is set in `.env`, the server uses that. Open `http://localhost:<that port>`.

## Quick reference

| Step | Command / URL |
|------|----------------|
| Start server | `npm run dev:backend` |
| Open app (default) | http://localhost:3000 |
| Custom port | Use the port printed when the server starts |
