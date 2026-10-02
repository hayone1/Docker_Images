# Official Python slim image (bitnami/python free tags are no longer maintained)
FROM python:3.13-slim-trixie

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG KUBECTL_VERSION=v1.37.1
ARG TARGETARCH=amd64

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Apply security updates and install curl for downloads
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Install kubectl (pinned, checksum verified)
RUN curl -fsSLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && echo "$(curl -fsSL https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256)  kubectl" | sha256sum -c - \
    && install -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl \
    && kubectl version --client

# Install relevant python packages (pinned)
RUN pip install --upgrade pip \
    && pip install \
        kubernetes==36.0.3 \
        PyYAML==6.0.3 \
        argo-workflows==6.7.18 \
        hera==7.1.0 \
        multiprocess==0.70.19

# Run as non-root user
RUN useradd --create-home --uid 1001 --shell /bin/bash app
USER 1001
WORKDIR /home/app

ENTRYPOINT ["python"]
