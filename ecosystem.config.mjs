export default {
  apps: [{
    name: 'abcotronics-erp',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // DATABASE_URL must be set in .env file on the server
      // DO NOT hardcode database URLs here - always use .env file
      // PM2 will automatically load DATABASE_URL from .env file
      DATABASE_URL: process.env.DATABASE_URL, // Must be set in .env - no fallback
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};

