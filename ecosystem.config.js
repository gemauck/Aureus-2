module.exports = {
  apps: [
    {
      name: 'abcotronics-erp',
      script: './server/server.js',
      instances: 2, // Run 2 instances for load balancing
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      // Restart strategy
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
      restart_delay: 4000,
      // Advanced features
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
    },
  ],
  
  deploy: {
    production: {
      user: 'deploy',
      host: process.env.DROPLET_HOST || 'your-droplet-ip',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/abcotronics-erp.git',
      path: '/var/www/abcotronics-erp',
      'post-deploy': 'cd server && npm ci --only=production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /var/www/abcotronics-erp',
    },
  },
};
