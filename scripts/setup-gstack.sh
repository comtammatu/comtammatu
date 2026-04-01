#!/bin/bash
# Install gstack skills for this project
# Run once after cloning: ./scripts/setup-gstack.sh

set -e

GSTACK_DIR=".claude/skills/gstack"

if [ -d "$GSTACK_DIR" ]; then
  echo "gstack already installed. Run /gstack-upgrade to update."
  exit 0
fi

echo "Installing gstack..."
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_DIR"
cd "$GSTACK_DIR" && ./setup
echo "Done. 31 gstack skills available."
