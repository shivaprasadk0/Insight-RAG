# Quick Build & Deploy Steps

## 1️⃣ Build the Frontend

Open **Command Prompt** (cmd.exe):

```cmd
cd <your-project-path>\Insight_RAG\apps\frontend
npm run build
```

✅ This creates a `dist` folder with production-ready files

---

## 2️⃣ Create ZIP File

```cmd
cd dist
tar -a -c -f ..\frontend-deploy.zip *
cd ..
```

✅ Creates `frontend-deploy.zip` in the Frontend folder

---

## 3️⃣ Deploy to Azure

### Option A: Azure Portal (Easiest)

1. Go to: `https://<your-app-name>.scm.azurewebsites.net`
2. Click **Tools** → **Zip Push Deploy**
3. Drag & drop `frontend-deploy.zip`

### Option B: Azure CLI

```bash
az webapp deployment source config-zip --resource-group <rg-name> --name <app-name> --src frontend-deploy.zip
```

---

## 4️⃣ Configure Azure App Service

**Application Settings:**

- `WEBSITE_NODE_DEFAULT_VERSION` = `~20`
- `SCM_DO_BUILD_DURING_DEPLOYMENT` = `false`

**Startup Command:**

- Windows: Leave blank
- Linux: `pm2 serve /home/site/wwwroot --no-daemon --spa`

---

## ✅ Done

Visit: `https://<your-app-name>.azurewebsites.net`

Backend API: `https://esg-chatbot-wa01.azurewebsites.net`
