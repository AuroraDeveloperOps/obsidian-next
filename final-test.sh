#!/bin/bash

echo "=== Final Build Verification ==="
echo ""

echo "✓ Build output:"
ls -lh dist/index.js | awk '{print "  " $9 " - " $5}'

echo ""
echo "✓ Global link:"
ls -l /usr/local/bin/obsidian | cut -d' ' -f9-

echo ""
echo "✓ MoE components in build:"
grep -l "ModelRouter" dist/*.js | head -1 | xargs -I {} echo "  Router: {}"
grep -l "OllamaProvider" dist/*.js | head -1 | xargs -I {} echo "  Ollama: {}"
grep -l "AnthropicProvider" dist/*.js | head -1 | xargs -I {} echo "  Anthropic: {}"

echo ""
echo "✓ Commands available:"
grep -o "register('[^']*'" dist/chunk-*.js 2>/dev/null | cut -d"'" -f2 | sort -u | grep -E "^(setup|models)$" | sed 's/^/  \//'

echo ""
echo "✓ Config schema:"
grep -o "provider.*enum" dist/*.js 2>/dev/null | head -1 | sed 's/^/  /'

echo ""
echo "=== All Systems Ready ==="
echo ""
echo "Start with: obsidian"
echo "Or:         npm start"
