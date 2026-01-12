/**
 * Mock Express request and response objects for testing
 */

export function createMockRequest(options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = {},
    query = {},
    params = {},
    user = null,
  } = options;

  return {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
    query,
    params,
    user,
  };
}

export function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    writableEnded: false,
    data: null,
    cookies: [],
    
    status(code) {
      this.statusCode = code;
      return this;
    },
    
    setHeader(name, value) {
      this.headers[name] = value;
      if (name === 'Set-Cookie') {
        if (Array.isArray(value)) {
          this.cookies.push(...value);
        } else {
          this.cookies.push(value);
        }
      }
      return this;
    },
    
    getHeader(name) {
      return this.headers[name];
    },
    
    end(data) {
      if (this.headersSent || this.writableEnded) {
        return;
      }
      this.headersSent = true;
      this.writableEnded = true;
      this.data = data;
      return this;
    },
    
    json(data) {
      if (this.headersSent || this.writableEnded) {
        return;
      }
      this.setHeader('Content-Type', 'application/json');
      this.data = JSON.stringify(data);
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    
    send(data) {
      if (this.headersSent || this.writableEnded) {
        return;
      }
      this.data = data;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    
    // Helper to get parsed response data
    getData() {
      if (typeof this.data === 'string') {
        try {
          return JSON.parse(this.data);
        } catch (e) {
          return this.data;
        }
      }
      return this.data;
    },
    
    // Helper to get cookies
    getCookies() {
      return this.cookies;
    },
  };
  
  return res;
}






