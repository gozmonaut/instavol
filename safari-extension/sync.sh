#!/bin/sh
# Xcode bundles a copy of src/ (xcode/.../Extension/Resources). Run this after every change in src/.
set -e
cd "$(dirname "$0")"
cp src/* "xcode/Bewaar in Instavol/Bewaar in Instavol Extension/Resources/"
echo "Resources bijgewerkt."
# Nieuw bestand in src/? Voeg het ook toe aan project.xcproj (lijst "Resources"), anders zit het niet in de extensie.
