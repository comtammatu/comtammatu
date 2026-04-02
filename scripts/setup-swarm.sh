#!/bin/bash
# Install claude-swarm MCP server for multi-agent coordination
# Run once after cloning: ./scripts/setup-swarm.sh
#
# What it does:
#   1. Clones claude-swarm to ~/.claude-swarm (shared across projects)
#   2. Installs npm dependencies
#   3. Registers as MCP server in Claude Code (user scope)
#   4. Adds project-level MCP permissions in .claude/settings.local.json
#
# Requirements: Node.js >= 20, npm, Claude Code CLI (`claude`)

set -e

SWARM_DIR="$HOME/.claude-swarm"
REPO_URL="https://github.com/nghiack7/claude-swarm.git"

echo "=== Claude Swarm Setup ==="
echo ""

# ─── 1. Check prerequisites ───

if ! command -v node &>/dev/null; then
  echo "Error: Node.js not found. Install Node.js >= 20 first."
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 required (found v$(node -v))"
  exit 1
fi

if ! command -v claude &>/dev/null; then
  echo "Error: Claude Code CLI not found. Install from https://claude.ai/code"
  exit 1
fi

# ─── 2. Clone or update ───

if [ -d "$SWARM_DIR" ]; then
  echo "claude-swarm already cloned at $SWARM_DIR"
  echo "Pulling latest..."
  cd "$SWARM_DIR" && git pull --rebase 2>/dev/null || true
else
  echo "Cloning claude-swarm..."
  git clone --depth 1 "$REPO_URL" "$SWARM_DIR"
fi

# ─── 3. Install dependencies ───

echo "Installing dependencies..."
cd "$SWARM_DIR" && npm install --production=false 2>/dev/null

# ─── 4. Register MCP server ───

# Check if already registered
if claude mcp list 2>/dev/null | grep -q "claude-swarm"; then
  echo "MCP server already registered."
else
  echo "Registering MCP server..."
  claude mcp add --scope user --transport stdio claude-swarm -- \
    npx tsx "$SWARM_DIR/src/server.ts"
  echo "MCP server registered (user scope)."
fi

# ─── 5. Summary ───

echo ""
echo "=== Setup complete ==="
echo ""
echo "claude-swarm installed at: $SWARM_DIR"
echo "Database will be at:       ~/.claude-swarm.db (auto-created on first use)"
echo ""
echo "Available tools (22):"
echo "  Peer discovery:  list_peers, set_name, set_status, set_summary"
echo "  Rooms:           create_room, join_room, leave_room, list_rooms"
echo "  Messaging:       send_message, broadcast, check_messages, message_history"
echo "  Tasks:           create_task, update_task, list_tasks"
echo "  Scratchpad:      scratchpad_get, scratchpad_set, scratchpad_list"
echo ""
echo "Usage: Open multiple Claude Code sessions and use rooms to coordinate."
echo "Docs:  .claude/rules/swarm.md (agent roles + conventions)"
echo ""
