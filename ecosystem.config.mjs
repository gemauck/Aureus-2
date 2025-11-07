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
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:YOUR_PASSWORD_HERE@dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};

