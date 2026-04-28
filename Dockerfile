FROM docker.io/node:24-alpine

LABEL org.opencontainers.image.title="Hollo"
LABEL org.opencontainers.image.description="Federated single-user \
microblogging software"
LABEL org.opencontainers.image.url="https://docs.hollo.social/"
LABEL org.opencontainers.image.source="https://github.com/fedify-dev/hollo"
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later"

RUN apk add --no-cache ffmpeg jq libstdc++ pnpm

COPY pnpm-lock.yaml package.json /app/
WORKDIR /app/
RUN pnpm install --frozen-lockfile --prod

COPY . /app/

ARG VERSION
LABEL org.opencontainers.image.version="${VERSION}"
RUN \
  if [ "$VERSION" != "" ]; then \
    jq --arg version "$VERSION" '.version = $version' package.json > .pkg.json \
    && mv .pkg.json package.json; \
  fi

# Beszel agent 설치
ADD https://github.com/henrygd/beszel/releases/latest/download/beszel-agent_linux_amd64.tar.gz /tmp/agent.tar.gz
RUN cd /tmp && tar -xzf agent.tar.gz \
    && mv beszel-agent /usr/local/bin/ \
    && chmod +x /usr/local/bin/beszel-agent \
    && rm agent.tar.gz

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000
CMD ["pnpm", "run", "prod"]
