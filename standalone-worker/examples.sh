#!/bin/bash

# Pingmon Standalone Worker - API Usage Examples

BASE_URL="http://localhost:8080"

echo "=== Pingmon Standalone Worker API Examples ==="
echo ""

# Health check
echo "1. Health Check"
curl -s "${BASE_URL}/api/health" | jq .
echo ""

# Create monitor
echo "2. Create Monitor"
MONITOR_ID=$(curl -s -X POST "${BASE_URL}/api/monitors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Health Check",
    "url": "https://www.google.com",
    "method": "GET",
    "timeout_seconds": 30,
    "expected_status_code": 200,
    "check_interval_seconds": 60
  }' | jq -r '.data.id')

echo "Created monitor ID: ${MONITOR_ID}"
echo ""

# Get all monitors
echo "3. Get All Monitors"
curl -s "${BASE_URL}/api/monitors" | jq .
echo ""

# Wait for first check
echo "4. Waiting for first check (10 seconds)..."
sleep 10

# Get check results
echo "5. Get Check Results"
curl -s "${BASE_URL}/api/monitors/${MONITOR_ID}/results" | jq .
echo ""

# Get monitor statistics
echo "6. Get Monitor Statistics"
curl -s "${BASE_URL}/api/statistics/monitors/${MONITOR_ID}" | jq .
echo ""

# Get system statistics
echo "7. Get System Statistics"
curl -s "${BASE_URL}/api/statistics" | jq .
echo ""

# Update monitor
echo "8. Update Monitor (set to inactive)"
curl -s -X PUT "${BASE_URL}/api/monitors/${MONITOR_ID}" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}' | jq .
echo ""

# Export data
echo "9. Export Data"
curl -s "${BASE_URL}/api/export" > export_backup.json
echo "Data exported to export_backup.json"
echo ""

# Get scheduler stats
echo "10. Get Scheduler Stats"
curl -s "${BASE_URL}/api/scheduler/stats" | jq .
echo ""

echo "=== Examples Complete ==="
