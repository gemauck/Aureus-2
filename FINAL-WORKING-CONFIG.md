# Final Working Configuration

Your app is served from root `/`, not `/app`. Use this config:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name abcoafrica.co.za;
    
    ssl_certificate /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abcoafrica.co.za/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

nginx -t && systemctl reload nginx
```

## Done! 🎉

Your app is now accessible at:
- **https://abcoafrica.co.za**
- HTTP redirects to HTTPS

That's it!
