#!/bin/sh
# Wraps extension/ in an Xcode project (safari/) with the small Mac and iPhone
# apps that Safari needs to install an extension. The project points at
# extension/ instead of copying it, so edits there are picked up on the next
# build in Xcode. Needs a Mac with Xcode.
#
# The bundle ID must be unique to your Apple developer account. It defaults to
# com.<your Mac username>.MakeItDarker; set BUNDLE_ID to choose another.
set -eu
cd "$(dirname "$0")/.."

tool=safari-web-extension-packager
xcrun --find "$tool" >/dev/null 2>&1 || tool=safari-web-extension-converter # its name in older Xcode
if ! xcrun --find "$tool" >/dev/null 2>&1; then
  echo 'This needs a Mac with Xcode installed (xcrun safari-web-extension-packager).' >&2
  exit 1
fi

user=$(id -un | tr -cd 'A-Za-z0-9-')
xcrun "$tool" extension \
  --project-location safari \
  --app-name 'Make It Darker' \
  --bundle-identifier "${BUNDLE_ID:-com.${user:-me}.MakeItDarker}" \
  --swift \
  --no-prompt \
  --force
