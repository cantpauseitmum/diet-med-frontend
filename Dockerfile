FROM nginx:alpine

LABEL maintainer="Diet-Med Team"
LABEL description="Frontend web application container for Diet-Med TDP"

# Kopiowanie plików statycznych aplikacji
COPY src/ /usr/share/nginx/html/

# Kopiowanie konfiguracji serwera Nginx z proxy do backendu
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
