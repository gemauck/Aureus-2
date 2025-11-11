# Abcotronics ERP System

> Enterprise Resource Planning system for fuel management services, telemetry equipment manufacturing, and project management

[![Deploy Status](https://img.shields.io/badge/deploy-automated-brightgreen.svg)](https://github.com/yourusername/abcotronics-erp/actions)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-15+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-Private-red.svg)]()

## 🚀 Features

- **CRM & Client Management** - Complete client lifecycle tracking
- **Lead Management** - AIDA framework sales pipeline
- **Project Management** - Hierarchical task structures with time tracking
- **Invoicing** - South African VAT compliance (15%)
- **Time Tracking** - Employee time and project tracking
- **HR Management** - BCEA-compliant leave management
- **Manufacturing & Inventory** - Multi-location tracking
- **User Management** - Role-based access control
- **Dashboard & Analytics** - Real-time business insights

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Prerequisites

### Development Environment

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **PostgreSQL** 15+ ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/downloads))
- **Code Editor** (VS Code recommended)

### Accounts Needed for Deployment

- GitHub account
- DigitalOcean account (or similar cloud provider)
- Domain name (optional but recommended)

## 🏃 Local Development

### 1. Clone Repository

```bash
git clone git@github.com:yourusername/abcotronics-erp.git
cd abcotronics-erp
```

### 2. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Return to root
cd ..
```

### 3. Setup Database

```bash
# Create database
createdb abcotronics_erp

# Or using psql
psql -U postgres
CREATE DATABASE abcotronics_erp;
```

### 4. Configure Environment

```bash
# Copy environment template
cp server/.env.example server/.env

# Edit with your settings
nano server/.env
```

**Required environment variables:**

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/abcotronics_erp

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_jwt_secret

# Server
PORT=3000
NODE_ENV=development
```

### 5. Run Migrations

```bash
cd server
npm run migrate
```

### 6. Seed Database (Optional)

```bash
npm run seed
```

### 7. Start Development Server

```bash
# Start backend
npm run dev

# In another terminal, serve frontend
cd ..
python3 -m http.server 8000
```

### 8. Access Application

- **Frontend**: http://localhost:8000
- **API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/health

## 🚀 Deployment

Complete deployment guide available at: [deploy/DEPLOYMENT_GUIDE.md](deploy/DEPLOYMENT_GUIDE.md)

### Quick Deploy to DigitalOcean

```bash
# 1. Setup droplet (on server)
wget https://raw.githubusercontent.com/yourusername/abcotronics-erp/main/deploy/setup-droplet.sh
chmod +x setup-droplet.sh
sudo ./setup-droplet.sh

# 2. Clone and configure
sudo -u deploy git clone git@github.com:yourusername/abcotronics-erp.git /var/www/abcotronics-erp
cd /var/www/abcotronics-erp
cp .env.template .env
nano .env

# 3. Install and start
cd server && npm ci --only=production
npm run migrate
pm2 start ../ecosystem.config.js
pm2 save
```

### Automated Deployment

Push to `main` branch triggers automatic deployment via GitHub Actions:

```bash
git add .
git commit -m "Deploy new features"
git push origin main
```

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React (Browser-based Babel transpilation)
- Tailwind CSS
- HTML5 Drag & Drop
- LocalStorage (development)

**Backend:**
- Node.js / Express.js
- PostgreSQL 15
- Prisma ORM
- JWT Authentication

**DevOps:**
- PM2 Process Manager
- Nginx Reverse Proxy
- GitHub Actions CI/CD
- Let's Encrypt SSL

### Project Structure

```
abcotronics-erp/
├── server/                 # Backend API
│   ├── routes/            # API endpoints
│   ├── models/            # Database models
│   ├── middleware/        # Auth, validation
│   └── server.js          # Entry point
├── src/                   # Frontend source
│   ├── components/        # React components
│   │   ├── clients/      # CRM module
│   │   ├── projects/     # Project management
│   │   ├── time/         # Time tracking
│   │   ├── invoicing/    # Invoicing module
│   │   └── hr/           # HR management
│   └── utils/            # Utilities
├── deploy/               # Deployment configs
│   ├── nginx.conf       # Nginx configuration
│   ├── setup-droplet.sh # Server setup script
│   └── DEPLOYMENT_GUIDE.md
├── .github/workflows/   # GitHub Actions
└── ecosystem.config.js  # PM2 configuration
```

## 📚 Documentation

- **[Deployment Guide](deploy/DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
- **[API Documentation](docs/API.md)** - API endpoints reference
- **[Database Schema](docs/DATABASE.md)** - Database structure
- **[Component Guide](docs/COMPONENTS.md)** - Frontend components
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues

## 🔧 Development Scripts

```bash
# Server
npm run dev          # Start development server
npm run start        # Start production server
npm run migrate      # Run database migrations
npm run seed         # Seed database
npm test             # Run tests

# Deployment
./deploy/deploy.sh   # Quick deploy (on server)
./deploy/rollback.sh # Rollback deployment
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- clients

# Watch mode
npm test -- --watch
```

## 🔒 Security

- JWT-based authentication
- Role-based access control (RBAC)
- HTTPS/SSL encryption
- SQL injection protection (Prisma)
- XSS protection
- CSRF tokens
- Rate limiting
- Input validation

## 🌍 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | JWT signing secret | ✅ |
| `SESSION_SECRET` | Session signing secret | ✅ |
| `PORT` | Server port (default: 3000) | ❌ |
| `NODE_ENV` | Environment (development/production) | ✅ |
| `CORS_ORIGINS` | Allowed CORS origins | ✅ |
| `SMTP_HOST` | Email server host | ❌ |
| `SMTP_USER` | Email username | ❌ |
| `SMTP_PASSWORD` | Email password | ❌ |

## 🤝 Contributing

This is a private project. For internal contributors:

1. Create a feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open a Pull Request

### Branch Strategy

- `main` - Production branch (protected)
- `development` - Development branch
- `feature/*` - Feature branches
- `hotfix/*` - Urgent fixes

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## 📄 License

This project is private and proprietary to Abcotronics.

## 👥 Team

- **Developer**: Gareth Mau
- **Company**: Abcotronics
- **Industry**: Fuel Management Services & Telemetry

## 📞 Support

For issues or questions:
- Check [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- Review application logs: `pm2 logs`
- Contact: support@abcotronics.com

## 🙏 Acknowledgments

- Built with South African business requirements in mind
- SARS tax compliance
- BCEA labor law compliance
- VAT calculation (15%)

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Status**: Active Development

