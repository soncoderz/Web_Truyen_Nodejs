# ===== GIAI ĐOẠN 1: Build React app =====
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files và cài dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code và build
COPY . .
RUN npm run build

# ===== GIAI ĐOẠN 2: Serve bằng Nginx =====
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Copy cấu hình nginx cho React Router (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
