# Frontend Deployment Guide for Azure App Services

## Prerequisites
- Node.js installed
- Azure App Service created (Windows or Linux)
- Access to Azure Portal

## Configuration Files Created
✅ `.env.development` - For local development (uses Vite proxy)
✅ `.env.production` - For production build (uses direct Azure backend URL)
✅ `web.config` - For IIS/Windows Azure App Services
✅ `staticwebapp.config.json` - For Azure Static Web Apps (alternative)

---

## Build Steps

### Option 1: Using Command Prompt (Recommended for Windows)

1. **Open Command Prompt (cmd.exe)** - NOT PowerShell
   ```cmd
   cd <your-project-path>\Insight_RAG\apps\frontend
   ```

2. **Install dependencies** (if not already installed)
   ```cmd
   npm install
   ```

3. **Build for production**
   ```cmd
   npm run build
   ```

4. **Verify build output**
   - Check that `dist` folder is created
   - Should contain: `index.html`, `assets/` folder, `web.config`

---

### Option 2: Using PowerShell (if execution policy allows)

1. **Set execution policy** (Run PowerShell as Administrator)
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Navigate to project**
   ```powershell
   cd <your-project-path>\Insight_RAG\apps\frontend
   ```

3. **Install and build**
   ```powershell
   npm install
   npm run build
   ```

---

## Create Deployment ZIP

### Using File Explorer:
1. Navigate to `apps\frontend\dist` folder
2. Select ALL files inside `dist` (not the dist folder itself)
3. Right-click → Send to → Compressed (zipped) folder
4. Name it `frontend-deploy.zip`

### Using Command Prompt:
```cmd
cd dist
tar -a -c -f ..\frontend-deploy.zip *
cd ..
```

---

## Deploy to Azure App Services

### Method 1: Azure Portal (Easiest)

1. **Go to Azure Portal** → Your App Service
2. **Deployment Center** → Click "FTPS credentials" or "Local Git/FTP"
3. **Advanced Tools (Kudu)** → Go to `https://<your-app-name>.scm.azurewebsites.net`
4. **Tools** → **Zip Push Deploy**
5. **Drag and drop** `frontend-deploy.zip`
6. Wait for deployment to complete

### Method 2: Azure CLI

```bash
az login
az webapp deployment source config-zip --resource-group <resource-group-name> --name <app-name> --src frontend-deploy.zip
```

### Method 3: Using Kudu REST API

```cmd
curl -X POST -u <deployment-username>:<deployment-password> https://<app-name>.scm.azurewebsites.net/api/zipdeploy --data-binary @frontend-deploy.zip
```

---

## Azure App Service Configuration

### Application Settings (in Azure Portal)

1. Go to **Configuration** → **Application settings**
2. Add these settings:

| Name | Value |
|------|-------|
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |

### Startup Command

**For Windows App Service:**
- Leave blank (IIS will serve static files using web.config)

**For Linux App Service:**
- Startup command: `pm2 serve /home/site/wwwroot --no-daemon --spa`
- OR install serve: Add to package.json and use: `npx serve -s dist -l 8080`

---

## Verify Deployment

1. **Check App Service URL**: `https://<your-app-name>.azurewebsites.net`
2. **Test API calls**: Open browser console and verify calls go to `https://esg-chatbot-wa01.azurewebsites.net`
3. **Check for errors**: Look at Application Insights or Log Stream in Azure Portal

---

## Troubleshooting

### Issue: 404 on page refresh
**Solution**: Ensure `web.config` is in the root of deployed files

### Issue: API calls fail with CORS error
**Solution**: 
- Verify backend has CORS enabled for your frontend domain
- Check that `VITE_API_BASE_URL` is set correctly in `.env.production`

### Issue: Blank page
**Solution**:
- Check browser console for errors
- Verify all files are in `dist` folder
- Check Application Insights logs in Azure

### Issue: Build fails
**Solution**:
- Use Command Prompt instead of PowerShell
- Ensure all dependencies are installed: `npm install`
- Clear cache: `npm cache clean --force`

---

## Quick Reference

**Build Command**: `npm run build`
**Build Output**: `dist/` folder
**Deployment Package**: ZIP all contents of `dist/` folder
**Backend URL**: `https://esg-chatbot-wa01.azurewebsites.net`
**Environment**: Production (uses `.env.production`)

---

## Files Structure After Build

```
dist/
├── index.html
├── web.config
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── [other assets]
└── [other static files]
```

**Important**: Deploy the CONTENTS of `dist/`, not the `dist/` folder itself!
