#!/bin/bash

# Create images directory if it doesn't exist
mkdir -p images

# Convert SVG to different PNG sizes using ImageMagick
convert -background none -resize 16x16 icon.svg images/icon16.png
convert -background none -resize 48x48 icon.svg images/icon48.png
convert -background none -resize 128x128 icon.svg images/icon128.png