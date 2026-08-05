# Settl — OpenShift Deployment Guide & Technical Glossary

A complete, beginner-friendly explanation of how the **Settl** monorepo web application was containerized, deployed, and scaled on **Red Hat OpenShift Developer Sandbox**.

---

## 1. High-Level Architecture Overview

Settl is structured as a **Monorepo** (one single Git repository containing all parts of the application):

```
settl/
├── src/                  <-- React + Vite Frontend
├── backend/              <-- Express.js REST API Server
├── k8s/                  <-- Kubernetes & OpenShift Deployment Manifests
├── Dockerfile            <-- Frontend Container Blueprint (Nginx)
├── nginx.conf            <-- Frontend Web Server Configuration
├── backend/Dockerfile    <-- Backend Container Blueprint (Node.js)
└── .github/workflows/    <-- CI/CD Automated Pipeline
```

- **Frontend Application**: Built with React, TypeScript, and Vite. Packaged into a lightweight Nginx web server container listening on port `8080`.
- **Backend API**: Built with Node.js and Express. Handles API business logic and database operations, listening on port `3000`.
- **Database & Auth**: Supabase PostgreSQL database with Row Level Security (RLS) policies and WebSockets for real-time updates.

---

## 2. Key Terms & Concepts (Glossary)

Here are all the key terms used during this deployment, explained in simple terms:

| Keyword | What it means in plain English |
| :--- | :--- |
| **Monorepo** | A single repository containing multiple related projects (e.g., both frontend and backend code together). |
| **Container** | A standalone, isolated package containing your code, runtime, system libraries, and settings so it runs identically everywhere. |
| **Image** | The read-only "blueprint" used to launch container instances. Built from a `Dockerfile`. |
| **Dockerfile** | A script containing step-by-step instructions for building a container image. |
| **Pod** | The smallest deployable unit in Kubernetes/OpenShift. A Pod wraps one or more running container instances. |
| **Deployment** | A controller that manages Pods. It ensures a specified number of Pod replicas are always running and manages zero-downtime updates. |
| **Service (svc)** | An internal load balancer that gives a stable internal IP address and network name to a set of Pods. |
| **Route** | An OpenShift-specific feature that exposes a Service to the public internet with automated HTTPS (TLS) encryption. |
| **Secret** | A secure storage object for sensitive data like passwords, API keys, and database connections. |
| **ServiceAccount & RBAC** | Identity and security rules (Role-Based Access Control) specifying what a container is allowed to do inside the cluster. |
| **HorizontalPodAutoscaler (HPA)** | An automatic scaler that adds more Pod replicas when CPU/memory usage rises, and removes them when load drops. |
| **NetworkPolicy** | A firewall rule inside the cluster that controls which Pods can talk to each other. |
| **CronJob** | A scheduled automated task that runs on a timer (e.g., sending payment reminders every 6 hours). |
| **CI/CD** | Continuous Integration / Continuous Deployment. Automates building and deploying code whenever you push to GitHub. |

---

## 3. Step-by-Step Deployment Walkthrough

### Step 1: Creating Container Blueprints (`Dockerfiles`)

1. **Frontend `Dockerfile` (Root)**:
   Uses a **Multi-Stage Build**:
   - **Stage 1 (Build)**: Runs `node:22-alpine` to compile TypeScript & Vite into static HTML/JS/CSS assets.
   - **Stage 2 (Serve)**: Copies the built static files into a super lightweight `nginx:alpine` web server.

2. **Frontend `nginx.conf` (Root)**:
   - Configures Nginx to listen on non-privileged port `8080`.
   - Configures Single Page Application (SPA) fallback routing (`try_files $uri $uri/ /index.html`) so refreshing pages doesn't 404.
   - Redirects temporary cache paths (`client_body_temp_path`, `proxy_temp_path`) to `/tmp` for non-root OpenShift compatibility.

3. **Backend `backend/Dockerfile`**:
   - Uses `node:22-alpine` base image.
   - Installs production dependencies (`npm ci --omit=dev`).
   - Exposes port `3000` and launches `npm start`.

---

### Step 2: Solving OpenShift Security & Non-Root Permissions

OpenShift runs containers under an arbitrary non-root user ID for security (Security Context Constraint). 
To make Nginx run smoothly without permission errors:
- In `Dockerfile`: Added `RUN chmod -R 777 /var/cache/nginx /var/log/nginx /var/run /tmp /usr/share/nginx/html`.
- Updated `nginx.conf` to store PID files in `/tmp/nginx.pid` instead of `/var/run/nginx.pid`.

---

### Step 3: Setting Up Credentials & Dynamic Routing

1. **Supabase Client (`src/supabase.ts`)**:
   Added explicit default fallbacks for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to ensure production builds resolve Supabase auth without DNS errors (`ERR_NAME_NOT_RESOLVED`).

2. **Dynamic API Routing (`src/data.ts`)**:
   Created `getApiBaseUrl()` so the frontend automatically detects its host environment:
   - **On OpenShift**: Automatically maps `settl-frontend-route-...` to `https://settl-backend-route-...`.
   - **On LAN**: Dynamically connects to the local IP host on port `3000`.
   - **On Localhost**: Uses `http://localhost:3000`.

---

### Step 4: Creating Kubernetes & OpenShift Manifests (`k8s/`)

We created 7 declarative YAML files in the `k8s/` folder:

1. **`rbac.yaml`**: Defines `ServiceAccount`, `Role`, and `RoleBinding` to allow the backend pod to access cluster secrets securely.
2. **`backend-deployment.yaml`**: Deploys 3 backend Pod replicas with:
   - Health probes (`/healthz` for liveness and readiness).
   - Resource limits (100m–300m CPU, 128Mi–256Mi RAM).
   - Environment variables loaded from `settl-secrets`.
3. **`backend-service-route.yaml`**: Exposes backend port `3000` internally via Service `settl-backend-svc` and externally via HTTPS Route `settl-backend-route`.
4. **`frontend-deployment.yaml`**: Deploys 2 frontend Pod replicas, exposing port `8080` internally via `settl-frontend-svc` and externally via HTTPS Route `settl-frontend-route`.
5. **`hpa.yaml`**: Configures HorizontalPodAutoscaler to dynamically scale backend Pods from **2 to 6 replicas** if average CPU exceeds **60%**.
6. **`networkpolicy.yaml`**: Restricts incoming traffic to backend Pods so only the frontend Pods and OpenShift Router ingress can reach port 3000.
7. **`cronjob.yaml`**: Schedules the reminder job (`npm run reminder`) to run automatically every 6 hours (`0 */6 * * *`).

---

### Step 5: Building and Applying to OpenShift

1. **Secret Creation**:
   ```bash
   oc create secret generic settl-secrets \
     --from-literal=SUPABASE_URL="..." \
     --from-literal=SUPABASE_SERVICE_ROLE_KEY="..." \
     -n pranil-shripad-dev
   ```

2. **Internal OpenShift Image Building**:
   ```bash
   oc new-build https://github.com/pranil-shripad/settl.git --name=settl-frontend --strategy=docker -n pranil-shripad-dev
   ```

3. **Applying All Manifests**:
   ```bash
   oc apply -f k8s/ -n pranil-shripad-dev
   ```

---

## 4. Live Deployment Details

| Resource | Status | Live Endpoint / Reference |
| :--- | :--- | :--- |
| **Frontend Route** | `Active / 100% Ready` | [https://settl-frontend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com](https://settl-frontend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com) |
| **Backend Route** | `Active / 100% Ready` | [https://settl-backend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com](https://settl-backend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com) |
| **Backend Replicas** | `2 Pods Running` | `settl-backend-7484f88fdc-5rkxd`, `settl-backend-7484f88fdc-wdnxx` |
| **Frontend Replicas** | `2 Pods Running` | `settl-frontend-7d77b89fc9-w7b24`, `settl-frontend-7d77b89fc9-xtttw` |
| **Autoscaler (HPA)** | `Active` | Min: 2, Max: 6, CPU Threshold: 60% |
| **Scheduled Job** | `Active` | Cron schedule: `0 */6 * * *` |

---

## 5. Verification Commands

To check the health of your OpenShift deployment at any time:

```bash
# Get status of all pods, services, routes, and autoscalers
oc get pods,svc,route,hpa,cronjob -n pranil-shripad-dev

# Test backend health check route
curl -s https://settl-backend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com/healthz

# Manually trigger the scheduled reminder job for testing
oc create job settl-reminder-manual --from=cronjob/settl-reminder-job -n pranil-shripad-dev
oc logs job/settl-reminder-manual -n pranil-shripad-dev
```
