# Stage 1: build the Vite app
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve built static files with OpenShift non-root compatibility
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Configure main nginx pid to /tmp and grant full permissions for arbitrary non-root UID
RUN sed -i 's|/var/run/nginx.pid|/tmp/nginx.pid|g' /etc/nginx/nginx.conf && \
    chmod -R 777 /var/cache/nginx /var/log/nginx /var/run /tmp /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]