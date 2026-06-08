@echo off
echo ===================================================
echo   SJB QP-GEN AUTOMATIC DEPLOYMENT SCRIPT
echo ===================================================
echo.

echo [1/3] Pushing code to GitHub (This will automatically trigger Render to update the Backend)...
git add .
git commit -m "Automatic deployment update"
git push
echo.

echo [2/3] Building the Next.js Frontend...
cd frontend
call npm run build
cd ..
echo.

echo [3/3] Deploying Frontend to Firebase Hosting...
call firebase deploy --only hosting
echo.

echo ===================================================
echo   DEPLOYMENT COMPLETE! 
echo   Your Backend and Frontend are now updating.
echo ===================================================
