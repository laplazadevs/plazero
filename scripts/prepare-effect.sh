#!/usr/bin/env sh

set -eu

# The Effect source checkout is only needed for local development research
# (effect-ts skill). Skip it on build machines.
if [ -n "${VERCEL:-}" ] || [ -n "${CI:-}" ]; then
  exit 0
fi

repo_dir=".repos/effect"
repo_url="https://github.com/Effect-TS/effect-smol"

if [ -d "$repo_dir/.git" ]; then
  exit 0
fi

mkdir -p ".repos"
git clone "$repo_url" "$repo_dir"
