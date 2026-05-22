@echo off
rem Set the container name
set CONTAINER_NAME=queue-bot
set PULL=false

rem Parse arguments
if "%~1"=="--pull" (
    set PULL=true
) else if not "%~1"=="" (
    echo Unknown argument: %~1 1>&2
    echo Usage: %~nx0 [--pull] 1>&2
    exit /b 1
)

rem Check if the container is running
set RUNNING=
for /f "tokens=*" %%i in ('docker ps -q -f name=%CONTAINER_NAME%') do set RUNNING=%%i
if defined RUNNING (
    rem Create a dated log file name
    set LOG_FILE=logs\%CONTAINER_NAME%_%date:~10,4%-%date:~4,2%-%date:~7,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%.log

    rem Save the logs to the file
    mkdir logs 2>nul
    docker logs %CONTAINER_NAME% > %LOG_FILE%

    if %errorlevel% equ 0 (
        echo Logs saved to %LOG_FILE%
    ) else (
        echo Failed to save logs
        exit /b 1
    )
) else (
    echo Container %CONTAINER_NAME% is not running. Skipping log saving.
)

rem Opt-in: fetch and merge from origin
if "%PULL%"=="true" (
    git fetch
    git merge --no-ff -m "Merged changes from remote repository."
)

docker compose down

docker compose up -d --build

docker image prune -f

echo Attaching to container %CONTAINER_NAME%... (CTRL+p CTRL+q to detach)

docker attach queue-bot
