# Clear Cache and Reload - Fix PDF Viewer

The frontend code has been updated but the browser is still showing the old error.

## Step 1: Clear Vite Cache

```powershell
cd "d:\Zip 4\attendance-system\frontend"
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
```

## Step 2: Clear Browser Cache Completely

### Option A: Hard Reload (Try this first)
1. Open DevTools (F12)
2. **Right-click** the refresh button
3. Select **"Empty Cache and Hard Reload"**

### Option B: Manual Clear
1. Press `Ctrl+Shift+Delete`
2. Select "Cached images and files"
3. Click "Clear data"
4. Close and reopen the browser

### Option C: Incognito Mode (Quick test)
1. Press `Ctrl+Shift+N` (new incognito window)
2. Go to `http://localhost:5173`
3. Login and test PDF

## Step 3: Verify Changes

Open the browser console and check the source code:

1. Press F12 (DevTools)
2. Go to **Sources** tab
3. Find `SecurePdfViewer.jsx` in the file tree
4. **Search for "pdfBlob"** (Ctrl+F)
5. Should find **NO MATCHES** (all changed to pdfData)

If you still see `pdfBlob`, the browser is loading old cached code.

## Step 4: Nuclear Option - Delete All Cache

If nothing works:

```powershell
# Stop Vite dev server (find and kill the process)
Get-Process -Name node | Where-Object { $_.CommandLine -like '*vite*' } | Stop-Process -Force

# Clear Vite cache
cd "d:\Zip 4\attendance-system\frontend"
Remove-Item -Recurse -Force node_modules\.vite

# Restart Vite
npm run dev
```

Then in browser:
1. Close ALL browser windows
2. Reopen browser
3. Go to `http://localhost:5173`
4. Test PDF

## What to Look For

After clearing cache, when you open the PDF you should see in console:

```
[SecurePdfViewer] Fetching PDF from: /api/policies-gridfs/...
[SecurePdfViewer] Response received: { status: 200, contentType: "application/pdf", dataSize: 348708 }
```

**NOT:**
```
ReferenceError: pdfBlob is not defined
```

## If STILL Getting pdfBlob Error

The file wasn't actually saved. Check:

```powershell
cd "d:\Zip 4\attendance-system\frontend\src\components"
Select-String -Path "SecurePdfViewer.jsx" -Pattern "pdfBlob"
```

Should return **nothing** or only comments.

If it returns actual code with pdfBlob, the file wasn't saved correctly.
