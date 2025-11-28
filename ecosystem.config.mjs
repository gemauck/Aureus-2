export default {
  apps: [{
    name: 'abcotronics-erp',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Digital Ocean Production Database - DO NOT CHANGE TO LOCAL
      // DATABASE_URL should be set in .env file, PM2 will use it from environment
      // This is a fallback - actual value comes from .env or environment
      // NOTE: Password is stored in .env file on server, not in this config
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:PASSWORD_FROM_ENV@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};

