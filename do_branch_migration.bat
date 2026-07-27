@echo off
echo ========================================
echo   BRAHMAND AI AGENT - Branch Migration
echo ========================================
echo.

cd /d "c:\Users\prarh\Downloads\BRAHMAND AI AGENT"

echo [STEP 1] Current branch check...
git branch -a
echo.

echo [STEP 2] Creating new branch 'developer-ai-agent' from current main...
git checkout -b developer-ai-agent
echo.

echo [STEP 3] Pushing 'developer-ai-agent' branch to GitHub...
git push -u origin developer-ai-agent
echo.

echo [STEP 4] Going back to main to delete it...
echo Cannot delete current branch, switching temporarily...

echo [STEP 5] Deleting remote 'main' branch...
git push origin --delete main
echo.

echo [STEP 6] Deleting remote 'sync-branch' branch...
git push origin --delete sync-branch
echo.

echo [STEP 7] Staying on new 'developer-ai-agent' branch...
git branch
echo.

echo ========================================
echo   DONE! New branch: developer-ai-agent
echo ========================================
pause
