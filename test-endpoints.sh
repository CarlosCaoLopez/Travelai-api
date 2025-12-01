
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
    elif [ "$method" == "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE $additional_args "$API_BASE_URL$path")
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
# EXPLORE SCREEN TESTS
# ========================================
test_explore_endpoints() {
    print_test_header "Explore Screen Endpoints"

    # Test artworks endpoint with different filters
    test_endpoint "GET" "/api/explore/artworks" "Get all artworks (default params)" "200"
    test_endpoint "GET" "/api/explore/artworks?limit=5" "Get artworks with limit=5" "200"
    test_endpoint "GET" "/api/explore/artworks?limit=10&offset=5" "Get artworks with pagination" "200"
    test_endpoint "GET" "/api/explore/artworks?language=en" "Get artworks in English" "200"
    test_endpoint "GET" "/api/explore/artworks?language=fr" "Get artworks in French" "200"

    # Test with category filters (these will depend on your actual data)
    # Uncomment and adjust these based on your actual category IDs
    # test_endpoint "GET" "/api/explore/artworks?category_id=painting" "Get artworks by category" "200"
    # test_endpoint "GET" "/api/explore/artworks?category_id=painting&subcategory_id=renaissance" "Get artworks by category and subcategory" "200"
    # test_endpoint "GET" "/api/explore/artworks?country=ES" "Get artworks by country" "200"
    # test_endpoint "GET" "/api/explore/artworks?category_id=painting&country=ES&language=es" "Get artworks with multiple filters" "200"

    # Test nearby locations endpoint
    # Note: These tests use Madrid, Spain coordinates as example
    # Latitude: 40.4168, Longitude: -3.7038 (Puerta del Sol, Madrid)
    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038" \
        "Get nearby locations (Madrid, default params)" "200"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&maxDistance=2000" \
        "Get nearby locations (Madrid, 2km radius)" "200"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&language=en" \
        "Get nearby locations in English" "200"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&limit=5" \
        "Get nearby locations with limit=5" "200"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&maxDistance=1000&language=en&limit=3" \
        "Get nearby locations with all params" "200"

    # Test with different cities
    test_endpoint "GET" "/api/explore/locations/nearby?latitude=41.3851&longitude=2.1734" \
        "Get nearby locations (Barcelona)" "200"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=48.8566&longitude=2.3522" \
        "Get nearby locations (Paris)" "200"

    # Test validation errors (should return 400)
    test_endpoint "GET" "/api/explore/locations/nearby?latitude=100&longitude=-3.7038" \
        "Invalid latitude (>90)" "400"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-200" \
        "Invalid longitude (<-180)" "400"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&maxDistance=100000" \
        "Invalid maxDistance (>50000)" "400"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&limit=100" \
        "Invalid limit (>50)" "400"

    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168&longitude=-3.7038&language=invalid" \
        "Invalid language code (not ISO 639-1)" "400"

    # Test missing required params (should return 400)
    test_endpoint "GET" "/api/explore/locations/nearby?latitude=40.4168" \
        "Missing longitude parameter" "400"

    test_endpoint "GET" "/api/explore/locations/nearby?longitude=-3.7038" \
        "Missing latitude parameter" "400"

    test_endpoint "GET" "/api/explore/locations/nearby" \
        "Missing both latitude and longitude" "400"
}

# ========================================
# ARTWORKS CATALOG TESTS
# ========================================
test_artworks_endpoints() {
    print_test_header "Artworks Catalog Endpoints"

    # Test get artwork by ID
    # Note: Replace this ID with an actual artwork ID from your database
    local ARTWORK_ID="73f25572-2a8c-4a31-88e8-d85f3d4a2f7c"
    
    test_endpoint "GET" "/api/artworks/$ARTWORK_ID" "Get artwork by ID (default language: es)" "200"
    test_endpoint "GET" "/api/artworks/$ARTWORK_ID?language=es" "Get artwork by ID in Spanish" "200"
    test_endpoint "GET" "/api/artworks/$ARTWORK_ID?language=en" "Get artwork by ID in English" "200"
    test_endpoint "GET" "/api/artworks/$ARTWORK_ID?language=fr" "Get artwork by ID in French" "200"
    
    # Test with non-existent ID (should return 404)
    test_endpoint "GET" "/api/artworks/00000000-0000-0000-0000-000000000000" "Get non-existent artwork (404)" "404"
    
    
    # Test with invalid UUID format (should return 404 or 400)
    test_endpoint "GET" "/api/artworks/invalid-id" "Get artwork with invalid ID" "404"
    
    # Test search endpoint
    test_endpoint "GET" "/api/artworks/search?q=a" "Search artworks (simple query)" "200"
    test_endpoint "GET" "/api/artworks/search?q=picasso" "Search artworks by author name" "200"
    test_endpoint "GET" "/api/artworks/search?q=guernica" "Search artworks by title" "200"
    test_endpoint "GET" "/api/artworks/search?q=test&language=en" "Search artworks in English" "200"
    test_endpoint "GET" "/api/artworks/search?q=test&limit=5" "Search artworks with limit" "200"
    test_endpoint "GET" "/api/artworks/search?q=test&limit=5&offset=2" "Search artworks with pagination" "200"
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
# USER COLLECTION TESTS (require authentication)
# ========================================
test_user_collection_endpoints() {
    print_test_header "User Collection Endpoints (Authentication Required)"

    # These should return 401 Unauthorized without auth token
    test_endpoint "GET" "/api/user/collection" \
        "Get collection summary (no auth)" "401"

    test_endpoint "GET" "/api/user/collection?language=es" \
        "Get collection summary in Spanish (no auth)" "401"

    test_endpoint "GET" "/api/user/collection?language=en" \
        "Get collection summary in English (no auth)" "401"

    # Test artist filter endpoint (should return 401 without auth)
    test_endpoint "GET" "/api/user/collection/artist/Pablo%20Picasso" \
        "Get artworks by artist (no auth)" "401"

    test_endpoint "GET" "/api/user/collection/artist/Pablo%20Picasso?language=es" \
        "Get artworks by artist in Spanish (no auth)" "401"

    test_endpoint "GET" "/api/user/collection/artist/Pablo%20Picasso?language=en" \
        "Get artworks by artist in English (no auth)" "401"

    # Test country filter endpoint (should return 401 without auth)
    test_endpoint "GET" "/api/user/collection/country/Spain" \
        "Get artworks by country (no auth)" "401"

    test_endpoint "GET" "/api/user/collection/country/Spain?language=es" \
        "Get artworks by country in Spanish (no auth)" "401"

    test_endpoint "GET" "/api/user/collection/country/Spain?language=en" \
        "Get artworks by country in English (no auth)" "401"

    # Test recent artworks endpoint (should return 401 without auth)
    test_endpoint "GET" "/api/user/collection/recent" \
        "Get recent artworks (no auth)" "401"

    test_endpoint "GET" "/api/user/collection/recent?limit=5" \
        "Get recent artworks with limit (no auth)" "401"

    test_endpoint "GET" "/api/user/collection/recent?language=en" \
        "Get recent artworks in English (no auth)" "401"

    # Test identify artwork endpoint (should return 401 without auth)
    # Note: Using a simple test due to JSON escaping complexity in test helper
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    print_info "Testing: Identify artwork (no auth)"
    IDENTIFY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H 'Content-Type: application/json' \
        -d '{"capturedImageUrl":"https://example.com/image.jpg","country":"Spain","category_id":"painting","subcategory_id":"modern","title":"Test","author":"Test","image_url":"https://example.com/ref.jpg"}' \
        "$API_BASE_URL/api/user/collection/identify")
    IDENTIFY_CODE=$(echo "$IDENTIFY_RESPONSE" | tail -n1)
    if [ "$IDENTIFY_CODE" == "401" ]; then
        print_success "Identify artwork (no auth) - HTTP 401"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        print_error "Identify artwork (no auth) - Expected HTTP 401, got HTTP $IDENTIFY_CODE"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    # Test delete collection item endpoint (should return 401 without auth)
    test_endpoint "DELETE" "/api/user/collection/550e8400-e29b-41d4-a716-446655440000" \
        "Delete collection item (no auth)" "401"

    # Note: To test with authentication, you would need to:
    # 1. Get a valid JWT token from Supabase
    # 2. Add it to the request like this:
    # test_endpoint "GET" "/api/user/collection" \
    #     "Get collection summary (with auth)" "200" \
    #     "-H 'Authorization: Bearer YOUR_TOKEN_HERE'"
    # test_endpoint "GET" "/api/user/collection/artist/Pablo%20Picasso" \
    #     "Get artworks by artist (with auth)" "200" \
    #     "-H 'Authorization: Bearer YOUR_TOKEN_HERE'"
    # test_endpoint "GET" "/api/user/collection/country/Spain" \
    #     "Get artworks by country (with auth)" "200" \
    #     "-H 'Authorization: Bearer YOUR_TOKEN_HERE'"
    # test_endpoint "GET" "/api/user/collection/recent" \
    #     "Get recent artworks (with auth)" "200" \
    #     "-H 'Authorization: Bearer YOUR_TOKEN_HERE'"
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
    test_explore_endpoints
    test_artworks_endpoints
    test_payment_endpoints
    test_user_collection_endpoints
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
