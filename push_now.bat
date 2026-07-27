@echo off
cd /d "c:\Users\prarh\Downloads\BRAHMAND AI AGENT"
echo Current branch:
git branch --show-current
echo.
echo Adding all files...
git add -A
echo.
echo Committing...
git commit -m "chore: migrate to developer-ai-agent branch - cleanup gitignore"
echo.
echo Pushing to developer-ai-agent...
git push origin developer-ai-agent
echo.
echo DONE! Check above for success message.
pause
