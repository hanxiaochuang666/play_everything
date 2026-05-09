FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    curl git nodejs npm \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash sandbox && \
    mkdir -p /workspace && \
    chown sandbox:sandbox /workspace

USER sandbox
WORKDIR /workspace

CMD ["tail", "-f", "/dev/null"]
