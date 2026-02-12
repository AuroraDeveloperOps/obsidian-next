#!/bin/bash

# Quick test of Ollama integration

echo "=== Testing Ollama Provider ==="
echo ""

echo "1. Checking Ollama service..."
curl -s http://localhost:11434/api/tags | grep -q '"models"' && echo "✅ Ollama running" || echo "❌ Ollama not running"

echo ""
echo "2. Testing model availability..."
ollama list | grep -q "llama3.1:8b-instruct-q4_K_M" && echo "✅ llama3.1:8b ready" || echo "❌ llama3.1:8b missing"
ollama list | grep -q "qwen2.5:3b-instruct-q4_K_M" && echo "✅ qwen2.5:3b ready" || echo "❌ qwen2.5:3b missing"

echo ""
echo "3. Testing simple generation..."
curl -s http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:3b-instruct-q4_K_M",
  "prompt": "What is 2+2? Answer in one word.",
  "stream": false
}' | grep -o '"response":"[^"]*"' | head -1

echo ""
echo "4. Build status..."
cd /Users/polyoxy/obsidian/obsidian-next
npm run build 2>&1 | tail -1

echo ""
echo "=== Test Complete ==="
