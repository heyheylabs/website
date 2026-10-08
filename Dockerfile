# heyheylabs.com.au as an nginx image for Asimov (HHL-WEB-4). Built and pushed by .github/workflows/image.yml.
# Base: nginxinc/nginx-unprivileged:1.30.5-alpine (stable line), index digest resolved Thu 8 Oct 2026 with
# `docker buildx imagetools inspect`. Bump tag and digest together.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3

# Our nginx.conf replaces the base's whole config; the base's default site goes so nothing else listens.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/nginx.conf
# docs/ minus CNAME and .nojekyll (Pages-only files, excluded in .dockerignore), owned by root and read-only to nginx
COPY docs/ /usr/share/nginx/html/
USER 101
RUN nginx -t

EXPOSE 8080
# nginx directly, not the base's entrypoint: its scripts rewrite files under /etc/nginx, which is read-only in the Pod
ENTRYPOINT ["nginx", "-g", "daemon off;"]
