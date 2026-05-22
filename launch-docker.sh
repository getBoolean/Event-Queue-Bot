# Set the container name
CONTAINER_NAME="queue-bot"
PULL=false

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --pull)
            PULL=true
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            echo "Usage: $0 [--pull]" >&2
            exit 1
            ;;
    esac
done

# Check if the container is running
if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
    # Create a dated log file name
    LOG_FILE="logs/${CONTAINER_NAME}_$(date +'%Y-%m-%d_%H-%M-%S').log"

    # Save the logs to the file
    mkdir -p logs
    docker logs -t $CONTAINER_NAME >& $LOG_FILE

    # Check if the logs were saved successfully
    if [ $? -eq 0 ]; then
        echo "Logs saved to $LOG_FILE"
    else
        echo "Failed to save logs"
        exit 1
    fi
else
    echo "Container ${CONTAINER_NAME} is not running. Skipping log saving."
fi

# Opt-in: fetch and merge from origin
if [ "$PULL" = true ]; then
    git fetch
    git merge --no-ff -m "Merged changes from remote repository."
fi

docker compose down

docker compose up -d --build

docker image prune -f

echo "Attaching to container ${CONTAINER_NAME}... (CTRL+p CTRL+q to detach)"

docker attach queue-bot
