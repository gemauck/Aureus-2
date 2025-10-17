#!/usr/bin/env python3
"""
Simple HTTP Server with correct MIME types for React/JSX files
"""
import http.server
import socketserver

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def guess_type(self, path):
        # Override MIME types for JavaScript modules
        if path.endswith('.jsx'):
            return 'text/javascript'
        if path.endswith('.js'):
            return 'text/javascript'
        if path.endswith('.mjs'):
            return 'text/javascript'
        return super().guess_type(path)

if __name__ == '__main__':
    Handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"✅ Server running at http://localhost:{PORT}")
        print(f"📂 Serving files from current directory")
        print(f"🛑 Press Ctrl+C to stop")
        print("")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n🛑 Server stopped")
