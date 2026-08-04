# Settl — Split Expenses, Settle Smart

Settl is an expense-splitting web application featuring server-side minimum cash-flow settlement calculations, secure group management, and scheduled reminders.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS (Vite)
- **Backend**: Node.js + Express REST API (Supabase Auth & PostgreSQL)
- **Settlement Engine**: Server-side min-cash-flow greedy algorithm minimizing payment transactions
- **Scheduled Job**: Standalone `reminder-job.js` process for Kubernetes CronJob deployment

## Getting Started

### Backend API Server
```bash
cd backend
npm install
npm start
```

### Scheduled Reminder Job
```bash
cd backend
npm run reminder
```

### Frontend Web App
```bash
npm install
npm run dev
```
