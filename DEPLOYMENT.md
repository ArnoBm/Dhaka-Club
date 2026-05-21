# Dhaka Club Temporary Live Demo Deployment

This setup does not require a custom domain. Use the free URLs from the hosting providers first, then replace them with the client's domain later.

## 1. Live MySQL

Create a MySQL database on Aiven, Railway, PlanetScale-compatible MySQL, or another managed MySQL provider.

Database name:

```text
dhaka_club
```

Import `database.sql` into that live database.

Keep these values ready:

```text
DB_HOST=
DB_PORT=
DB_USER=
DB_PASS=
DB_NAME=dhaka_club
DB_SSL=true
```

Use `DB_SSL=true` for hosts such as Aiven that require SSL.

## 2. Backend on Render

Create a Render Web Service from the GitHub repo.

Settings:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

Environment variables:

```env
PORT=5000
DB_HOST=your-live-db-host
DB_PORT=your-live-db-port
DB_USER=your-live-db-user
DB_PASS=your-live-db-password
DB_NAME=dhaka_club
DB_SSL=true
JWT_SECRET=use-a-long-random-secret
CORS_ORIGIN=https://your-admin-vercel-url.vercel.app
PUBLIC_API_BASE_URL=https://your-render-backend-url.onrender.com
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

After deploy, backend URL will look like:

```text
https://dhaka-club-backend.onrender.com
```

API base URL:

```text
https://dhaka-club-backend.onrender.com/api
```

## 3. Admin Panel on Vercel

Create a Vercel project from the same GitHub repo.

Settings:

```text
Root Directory: admin-panel
Build Command: npm run build
Output Directory: dist
```

Environment variable:

```env
VITE_API_BASE_URL=https://your-render-backend-url.onrender.com/api
```

After Vercel deploy, update the Render backend `CORS_ORIGIN` with the Vercel URL and redeploy/restart the backend.

## 4. Mobile APK for Testers

In `mobile-app/eas.json`, replace:

```text
https://YOUR_BACKEND_URL/api
```

with the live Render API URL:

```text
https://your-render-backend-url.onrender.com/api
```

Install EAS CLI:

```powershell
npm install -g eas-cli
```

Login:

```powershell
cd "D:\Custom Development\Dhaka-Club\mobile-app"
eas login
```

Build Android APK for testers:

```powershell
eas build --platform android --profile preview
```

Expo will provide an install link. Send that link to the client/testers.

## 5. Persistent Uploads

Set the Cloudinary variables in Render before uploading event covers, notice attachments, broadcast attachments, or profile photos. When these values are present, uploaded files are stored on Cloudinary and the database saves the permanent Cloudinary URL.

If the Cloudinary variables are missing, the backend falls back to the local `uploads` folder. That is acceptable only for local development because free hosting files may reset after redeploys/restarts.

## 6. Demo Links to Send Client

```text
Admin Panel: https://your-admin-vercel-url.vercel.app
Android APK: https://expo.dev/accounts/.../builds/...
```
