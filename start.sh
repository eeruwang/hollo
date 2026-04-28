#!/bin/sh
set -e

# Beszel 에이전트를 백그라운드로 기동
beszel-agent &

# Hollo 본체를 포그라운드로 기동
exec pnpm run prod
