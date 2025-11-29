#!/bin/bash

# ========================================
# TravelAI API - Endpoint Testing Script
# ========================================
# This script tests all implemented endpoints
# Add new tests in their respective sections

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BLUE='\033[0;34m'

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
VERBOSE="${VERBOSE:-false}"

# Counter for results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_test_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Test helper function
test_endpoint() {
    local method=$1
    local path=$2
    local description=$3
    local expected_status=$4
    local additional_args="${5:-}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    print_info "Testing: $description"

    local response
    local http_code

    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" $additional_args "$API_BASE_URL$path")
    elif [ "$method" == "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST $additional_args "$API_BASE_URL$path")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$VERBOSE" == "true" ]; then
        echo "Response body: $body"
        echo "HTTP code: $http_code"
    fi

    if [ "$http_code" == "$expected_status" ]; then
        print_success "$description - HTTP $http_code"
        PASSED_TESTS=$((PASSED_TESTS + 1))

        # Print response body if success and not verbose
        if [ "$VERBOSE" != "true" ] && [ "$http_code" == "200" ]; then
            echo "  Response: $body" | head -c 200
            echo "..."
        fi
        return 0
    else
        print_error "$description - Expected HTTP $expected_status, got HTTP $http_code"
        echo "  Response: $body"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# ========================================
# HEALTH CHECK TESTS
# ========================================
test_health_endpoints() {
    print_test_header "Health Check Endpoints"

    test_endpoint "GET" "/" "Root endpoint health check" "200"
}

# ========================================
# HOME SCREEN TESTS
# ========================================
test_home_endpoints() {
    print_test_header "Home Screen Endpoints"

    # Test quotes endpoint with different languages
    test_endpoint "GET" "/api/home/quotes" "Get quotes (default language: es)" "200"
    test_endpoint "GET" "/api/home/quotes?language=es" "Get quotes in Spanish" "200"
    test_endpoint "GET" "/api/home/quotes?language=en" "Get quotes in English" "200"
    test_endpoint "GET" "/api/home/quotes?language=fr" "Get quotes in French" "200"

    # Test with invalid language (should still return 200 with empty array or fallback)
    test_endpoint "GET" "/api/home/quotes?language=xx" "Get quotes with invalid language" "200"
}

# ========================================
# PAYMENTS TESTS (require authentication)
# ========================================
test_payment_endpoints() {
    print_test_header "Payment Endpoints (Authentication Required)"

    # These should return 401 Unauthorized without auth token
    test_endpoint "POST" "/api/payments/create-intent" \
        "Create payment intent (no auth)" "401" \
        "-H 'Content-Type: application/json' -d '{\"planId\":\"travel_pass\"}'"

    test_endpoint "GET" "/api/payments/subscription/status" \
        "Get subscription status (no auth)" "401"

    test_endpoint "POST" "/api/payments/setup-intent" \
        "Create setup intent (no auth)" "401" \
        "-H 'Content-Type: application/json' -d '{\"planId\":\"monthly\"}'"

    test_endpoint "POST" "/api/payments/create-subscription-with-payment-method" \
        "Create subscription (no auth)" "401" \
        "-H 'Content-Type: application/json' -d '{\"planId\":\"monthly\"}'"
}

# ========================================
# WEBHOOK TESTS
# ========================================
test_webhook_endpoints() {
    print_test_header "Webhook Endpoints"

    # Webhook should return 400 without signature
    test_endpoint "POST" "/webhooks/stripe" \
        "Stripe webhook (no signature)" "400" \
        "-H 'Content-Type: application/json' -d '{\"type\":\"test\"}'"
}

# ========================================
# MAIN EXECUTION
# ========================================
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════╗"
    echo "║     TravelAI API - Endpoint Test Suite            ║"
    echo "╚════════════════════════════════════════════════════╝"
    echo ""
    print_info "Base URL: $API_BASE_URL"
    print_info "Verbose mode: $VERBOSE"
    echo ""

    # Check if API is running
    print_info "Checking if API is accessible..."
    if curl -s -f -o /dev/null "$API_BASE_URL"; then
        print_success "API is accessible at $API_BASE_URL"
    else
        print_error "API is not accessible at $API_BASE_URL"
        print_warning "Make sure the API server is running with: pnpm run start:dev"
        exit 1
    fi

    # Run all test suites
    test_health_endpoints
    test_home_endpoints
    test_payment_endpoints
    test_webhook_endpoints

    # Print summary
    echo ""
    echo "╔════════════════════════════════════════════════════╗"
    echo "║               TEST SUMMARY                         ║"
    echo "╚════════════════════════════════════════════════════╝"
    echo ""
    echo "  Total tests:  $TOTAL_TESTS"
    print_success "Passed:       $PASSED_TESTS"
    if [ $FAILED_TESTS -gt 0 ]; then
        print_error "Failed:       $FAILED_TESTS"
    else
        echo -e "  ${GREEN}Failed:       $FAILED_TESTS${NC}"
    fi
    echo ""

    # Exit with error if any test failed
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    fi
}

# Run main function
main "$@"
