.PHONY: version dev build-mac build install sign clean clean-cache distclean

# Version format: YYYY.MMDD.N (semver-compatible)
# e.g., 2026.601.0 = first change committed on June 1, 2026
#       2026.601.1 = second change committed that day
#       2026.1225.0 = first change committed on Dec 25
#
# The version is a pure function of git history, NOT wall-clock build time,
# computed by scripts/compute-version.sh (the same script the pre-commit hook
# uses, so the build and the committed package.json always agree). Here we use
# its default mode = the version of HEAD as committed, making builds fully
# reproducible: the same commit always yields the same version.
#
# The pre-commit hook keeps package.json in sync in-repo; the build also injects
# the computed version into the packaged app via electron-builder's
# extraMetadata, so a commit that skipped the hook (--no-verify) still ships the
# correct version.
VERSION := $(shell sh scripts/compute-version.sh)

version:
	@echo "$(VERSION)"

# Run the app in development mode (electron-vite dev, hot reload)
dev:
	node node_modules/electron/install.js
	npm run dev

build-mac:
	npm ci
	npm run build:mac -- --config.extraMetadata.version=$(VERSION)

build: build-mac

install:
	open "$$(ls -t dist/*.dmg | head -1)"

# App display name, sourced from package.json productName (single source of truth)
APP_NAME := $(shell node -p "require('./package.json').productName")

sign:
	sudo codesign --force --deep --sign - "/Applications/$(APP_NAME).app"

# Remove generated build artifacts (safe: never touches tracked source like
# build/ or local files like .env / node_modules)
clean:
	rm -rf dist out coverage test-outputs ash_output
