#!/usr/bin/bash
# Build the site and serve it at http://localhost:8000, replacing any server already on that port
fuser -k 8000/tcp 2>/dev/null
npm run build && python3 -m http.server -d _site 8000
