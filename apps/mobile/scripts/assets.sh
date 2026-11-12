#!/bin/sh
# Puts Curvelet's icons and launch screens into the iOS and Android projects,
# made from the SVGs in apps/web/icons. Run from apps/mobile after `cap add`.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
ICONS="$HERE/../web/icons"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
TAURI="$HERE/../../node_modules/.bin/tauri"

# full-bleed icon for both stores, foreground alone for Android's adaptive icon
"$TAURI" icon "$ICONS/icon.svg" -o "$TMP/full" >/dev/null
"$TAURI" icon "$ICONS/icon-foreground.svg" -o "$TMP/fg" >/dev/null

RES="$HERE/android/app/src/main/res"
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  cp "$TMP/full/android/mipmap-$d/ic_launcher.png" "$TMP/full/android/mipmap-$d/ic_launcher_round.png" "$RES/mipmap-$d/"
  cp "$TMP/fg/android/mipmap-$d/ic_launcher_foreground.png" "$RES/mipmap-$d/"
done
sed -i '' 's/<color name="ic_launcher_background">#[0-9A-Fa-f]*</<color name="ic_launcher_background">#1C65C8</' "$RES/values/ic_launcher_background.xml"

# the App Store refuses icons with an alpha channel: pass it through JPEG to drop it
sips -s format jpeg "$TMP/full/ios/AppIcon-512@2x.png" --out "$TMP/ios.jpg" >/dev/null
sips -s format png "$TMP/ios.jpg" --out "$HERE/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png" >/dev/null

# launch screens: the mark on white, rendered once and cropped to each size
qlmanage -t -s 2732 -o "$TMP" "$ICONS/splash.svg" >/dev/null 2>&1
S="$TMP/splash.svg.png"
for f in "$HERE"/ios/App/App/Assets.xcassets/Splash.imageset/*.png; do cp "$S" "$f"; done
for f in "$RES"/drawable*/splash.png; do
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  m=$(( w > h ? w : h ))
  sips -z "$m" "$m" "$S" --out "$TMP/sp.png" >/dev/null
  sips -c "$h" "$w" "$TMP/sp.png" --out "$f" >/dev/null
done
echo "icons and launch screens updated"
