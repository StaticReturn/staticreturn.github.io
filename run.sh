#!/usr/bin/bash
# Build the site and serve it at http://localhost:8000
npm run build && python3 -m http.server -d _site 8000
