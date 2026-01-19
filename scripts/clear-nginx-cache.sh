#!/bin/bash
# Clear Nginx cache to ensure fresh content after deployment

echo "🧹 Clearing Nginx cache..."

# Clear nginx cache directory if it exists
if [ -d /var/cache/nginx ]; then
    echo "📁 Found nginx cache directory, clearing..."
    rm -rf /var/cache/nginx/*
    echo "✅ Nginx cache cleared"
else
    echo "ℹ️  No nginx cache directory found (this is normal if caching is disabled)"
fi

# Reload nginx to ensure fresh configuration
if command -v systemctl >/dev/null 2>&1; then
    echo "🔄 Reloading Nginx..."
    if systemctl reload nginx; then
        echo "✅ Nginx reloaded successfully"
    else
        echo "⚠️  Nginx reload failed (may not be running)"
    fi
elif command -v nginx >/dev/null 2>&1; then
    echo "🔄 Testing Nginx configuration..."
    if nginx -t; then
        # Try to reload using nginx -s reload
        if [ -f /var/run/nginx.pid ]; then
            kill -HUP $(cat /var/run/nginx.pid) 2>/dev/null && echo "✅ Nginx reloaded" || echo "⚠️  Nginx reload failed"
        else
            echo "⚠️  Nginx PID file not found"
        fi
    else
        echo "⚠️  Nginx configuration test failed"
    fi
else
    echo "⚠️  Nginx not found on system"
fi

echo "✅ Cache clearing complete"













