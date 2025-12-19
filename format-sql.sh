#!/usr/bin/env bash
# sparkfmt - Spark SQL Formatter CLI Script
#
# This script formats Spark SQL files using the sparkfmt formatter.
#
# Usage:
#   ./format-sql.sh <input.sql> [output.sql]
#
# Examples:
#   ./format-sql.sh query.sql                    # Format and print to stdout
#   ./format-sql.sh query.sql formatted.sql      # Format and save to file
#   ./format-sql.sh - < query.sql                # Read from stdin
#
# The script will build the formatter if needed.

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if we need to build the formatter
if [ ! -f "$SCRIPT_DIR/target/release/sparkfmt" ] && [ ! -f "$SCRIPT_DIR/target/debug/sparkfmt" ]; then
    echo "Building sparkfmt formatter..." >&2
    cd "$SCRIPT_DIR"
    cargo build --release -p sparkfmt-core --bin sparkfmt
    echo "Build complete!" >&2
    echo "" >&2
fi

# Determine which binary to use (prefer release, fallback to debug)
SPARKFMT_BIN=""
if [ -f "$SCRIPT_DIR/target/release/sparkfmt" ]; then
    SPARKFMT_BIN="$SCRIPT_DIR/target/release/sparkfmt"
elif [ -f "$SCRIPT_DIR/target/debug/sparkfmt" ]; then
    SPARKFMT_BIN="$SCRIPT_DIR/target/debug/sparkfmt"
else
    echo "Error: sparkfmt binary not found. Please run 'cargo build -p sparkfmt-core --bin sparkfmt' first." >&2
    exit 1
fi

# Run the formatter with all arguments passed through
exec "$SPARKFMT_BIN" "$@"
