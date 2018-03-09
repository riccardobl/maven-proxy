#!/bin/bash
npm install request basic-auth
find ./data  -type f -name "*.dl"  -exec rm  "{}" +
find ./data  -type f -name "*.lock"  -exec rm "{}" +
node src/proxy.js ./templates/proxy-debug.json ./templates/auth.json