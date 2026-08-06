# Settl — OpenShift Deployment & Hackathon Deliverables Guide

A complete, beginner-friendly guide and verification matrix for the **Settl** monorepo application deployed on **Red Hat OpenShift Developer Sandbox**.

---

## 1. High-Level Architecture Overview

Settl is structured as a **Monorepo** (one single Git repository containing all parts of the application):

```
settl/
├── src/                  <-- React + Vite Frontend
├── backend/              <-- Express.js REST API Server
├── k8s/                  <-- Kubernetes & OpenShift Deployment Manifests
│   ├── rbac.yaml                 <-- ServiceAccount & RBAC
│   ├── backend-deployment.yaml   <-- Backend Deployment with Probes & Volume Mount
│   ├── backend-service-route.yaml<-- Backend ClusterIP & Edge TLS Route
│   ├── frontend-deployment.yaml  <-- Frontend Deployment & TLS Route
│   ├── hpa.yaml                  <-- HorizontalPodAutoscaler (CPU 60%)
│   ├── networkpolicy.yaml        <-- Ingress Network Isolation Policy
│   ├── cronjob.yaml              <-- Event-Driven Payment Reminder CronJob
│   ├── pvc.yaml                  <-- PersistentVolumeClaim (Storage)
│   └── tekton-pipeline.yaml      <-- Tekton Pipeline Manifest
├── Dockerfile            <-- Frontend Container Blueprint (Nginx)
├── nginx.conf            <-- Frontend Web Server Configuration
├── backend/Dockerfile    <-- Backend Container Blueprint (Node.js)
└── .github/workflows/    <-- CI/CD Automated Pipeline
```

---

## 2. Deliverables Compliance Matrix

| Deliverable | Implementation Detail | Location in Repository / Cluster |
| :--- | :--- | :--- |
| **1. Source Code in Git** | Monorepo structure containing frontend, backend, Dockerfiles, and manifests. | GitHub: `github.com/pranil-shripad/settl` |
| **2. CI/CD Pipeline** | Automated build, test, and zero-downtime deployment pipeline. | [`.github/workflows/deploy.yml`](file://.github/workflows/deploy.yml) & OpenShift BuildConfig `bc/settl-frontend` |
| **3. Kubernetes/OpenShift Manifests** | Declarative YAML specifications for all cluster components. | Directory: [`k8s/`](file://k8s/) (9 YAML files) |
| **4. Container Registry Storage** | Container images stored in Quay.io and OpenShift Internal ImageRegistry. | `quay.io/pranil-shripad/settl-backend:v1` & `image-registry.openshift-image-registry.svc:5000` |
| **5. Serverless / Event-Driven Workload** | Automated event-driven payment reminder job triggered on schedule. | [`k8s/cronjob.yaml`](file://k8s/cronjob.yaml) (`npm run reminder`) |
| **6. Load Balancing** | Multi-instance load balancing via OpenShift Services and Ingress Routers. | [`k8s/backend-service-route.yaml`](file://k8s/backend-service-route.yaml) & [`k8s/frontend-deployment.yaml`](file://k8s/frontend-deployment.yaml) |
| **7. Horizontal Pod Autoscaling (HPA)** | Dynamic scaling from 2 to 6 replicas based on 60% CPU utilization threshold. | [`k8s/hpa.yaml`](file://k8s/hpa.yaml) |
| **8. High Availability & Rolling Updates** | Multi-replica deployments with zero-downtime rolling update strategy (`maxUnavailable: 0`). | [`k8s/backend-deployment.yaml`](file://k8s/backend-deployment.yaml) & [`k8s/frontend-deployment.yaml`](file://k8s/frontend-deployment.yaml) |
| **9. Security (TLS, Secrets, RBAC, NetPol)** | Edge TLS termination, `settl-secrets`, `ServiceAccount`/`RoleBinding`, ingress firewall rules. | [`k8s/rbac.yaml`](file://k8s/rbac.yaml), [`k8s/networkpolicy.yaml`](file://k8s/networkpolicy.yaml), `settl-secrets` |
| **10. Health Probes** | Startup, Liveness, and Readiness probes configured on all application workloads. | [`k8s/backend-deployment.yaml`](file://k8s/backend-deployment.yaml) (`/healthz`) |
| **11. Persistent Storage** | PersistentVolumeClaim requesting persistent storage for backend state/uploads. | [`k8s/pvc.yaml`](file://k8s/pvc.yaml) (`settl-backend-pvc`) |
| **12. Monitoring & Logging** | Real-time monitoring metrics and log streams available via Prometheus and OpenShift Console. | OpenShift Console $\rightarrow$ **Observe** $\rightarrow$ **Dashboards / Metrics** |
| **13. Live Demonstration** | Operational frontend and backend HTTPS endpoints. | **Frontend**: [settl-frontend-route](https://settl-frontend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com)<br>**Backend**: [settl-backend-route](https://settl-backend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com) |

---

## 3. Detailed Deliverables & Verification Steps

### 1. CI/CD Pipeline
- **GitHub Actions**: Configured in [`.github/workflows/deploy.yml`](file://.github/workflows/deploy.yml). Automatically builds, tests, and deploys on every push to `main`.
- **OpenShift BuildConfig**: Tracks the repository and triggers image builds inside OpenShift's internal registry.
- **Tekton Pipeline**: Configured in [`k8s/tekton-pipeline.yaml`](file://k8s/tekton-pipeline.yaml).

### 2. High Availability & Autoscaling
- **Backend Deployment**: Runs 3 initial replicas with rolling update strategy:
  ```yaml
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  ```
- **HPA**: Monitored via [`k8s/hpa.yaml`](file://k8s/hpa.yaml), automatically scales backend instances from 2 to 6 based on CPU load.

### 3. Security & Isolation
- **Edge TLS**: Automated HTTPS routing on both frontend and backend OpenShift Routes.
- **Secrets**: Credentials (Supabase URL, Service Role Key, JWT Secret) managed via `settl-secrets`.
- **RBAC**: Service account `settl-backend-sa` scoped strictly via Role and RoleBinding in [`k8s/rbac.yaml`](file://k8s/rbac.yaml).
- **NetworkPolicy**: Restricts backend ingress traffic to frontend pods and OpenShift Router ingress in [`k8s/networkpolicy.yaml`](file://k8s/networkpolicy.yaml).

### 4. Health Probes & Storage
- **Probes**: Configured with `startupProbe`, `livenessProbe`, and `readinessProbe` targeting `/healthz` on port 3000.
- **Persistent Volume**: [`k8s/pvc.yaml`](file://k8s/pvc.yaml) provisions `settl-backend-pvc` mounted at `/app/data`.

---

## 4. Live Verification Commands

Execute these commands to demonstrate your complete deployment live during evaluation:

```bash
# 1. Get complete cluster status (Pods, Services, Routes, HPA, CronJob)
oc get pods,svc,route,hpa,cronjob,pvc -n pranil-shripad-dev

# 2. Test live HTTPS backend health check route
curl -s https://settl-backend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com/healthz

# 3. Test live HTTPS frontend route
curl -s https://settl-frontend-route-pranil-shripad-dev.apps.rm3.7wse.p1.openshiftapps.com

# 4. Trigger the serverless/event-driven reminder job manually
oc create job settl-reminder-demo --from=cronjob/settl-reminder-job -n pranil-shripad-dev
oc logs job/settl-reminder-demo -n pranil-shripad-dev
```
