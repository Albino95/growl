#!/bin/bash

# Quick Backend Test Script
# Tests basic connectivity and health

BASE_URL="${API_BASE_URL:-https://growl-backend.albino-ndreu.workers.dev/api/v1}"

echo "🔍 Testing Growl Backend API"
echo "Base URL: $BASE_URL"
echo ""

# Test Health Check
echo "1. Testing Health Check..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ Health Check: PASSED (Status: $HTTP_CODE)"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo "❌ Health Check: FAILED (Status: $HTTP_CODE)"
    echo "$BODY"
fi

echo ""
echo "2. Testing Sign Up..."
SIGNUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/sign-up" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"test-$(date +%s)@example.com\",
    \"password\": \"TestPassword123!\",
    \"username\": \"testuser\"
  }")

HTTP_CODE=$(echo "$SIGNUP_RESPONSE" | tail -n1)
BODY=$(echo "$SIGNUP_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Sign Up: PASSED (Status: $HTTP_CODE)"
    TOKEN=$(echo "$BODY" | jq -r '.data.token' 2>/dev/null)
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
        echo "   Token received: ${TOKEN:0:20}..."
        echo ""
        echo "3. Testing Get Feed with token..."
        FEED_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/feed/feed" \
          -H "Authorization: Bearer $TOKEN")
        FEED_CODE=$(echo "$FEED_RESPONSE" | tail -n1)
        if [ "$FEED_CODE" -eq 200 ]; then
            echo "✅ Get Feed: PASSED (Status: $FEED_CODE)"
        else
            echo "❌ Get Feed: FAILED (Status: $FEED_CODE)"
        fi
    fi
else
    echo "❌ Sign Up: FAILED (Status: $HTTP_CODE)"
    echo "$BODY"
fi

echo ""
echo "✅ Quick test complete!"
