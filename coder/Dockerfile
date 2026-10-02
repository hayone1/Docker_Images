FROM ghcr.io/coder/podman:ubuntu
USER root

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Tool versions (pinned; bump deliberately)
ARG KUBECTL_VERSION=v1.37.1
ARG HELM_VERSION=v4.3.0
ARG NODE_VERSION=v24.21.0
ARG TF_VERSION=1.16.4
ARG YQ_VERSION=v4.54.1
ARG JQ_VERSION=1.8.2
ARG RANCHER_VERSION=v2.15.2
ARG KUBECONFORM_VERSION=v0.8.0
ARG FLUX_VERSION=2.9.6
ARG ARGO_VERSION=v4.1.4
ARG KPT_VERSION=1.0.1
ARG SUBCTL_VERSION=v0.24.2
ARG MONGOSH_VERSION=2.12.0
ARG CROSSPLANE_VERSION=v2.5.0

WORKDIR /tmp/install

# k6 apt repository
RUN mkdir -p /root/.gnupg && chmod 700 /root/.gnupg \
    && gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
        --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 \
    && echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
        > /etc/apt/sources.list.d/k6.list

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl wget gnupg \
        git sudo vim \
        python3-pip pipenv k6 \
        tar gzip xz-utils unzip \
        figlet netcat-openbsd tree \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Node.js (LTS) from official tarball, checksum verified
RUN curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" \
    && curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt" \
    && grep " node-${NODE_VERSION}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
    && tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
    && rm -f "node-${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt \
    && node --version && npm --version

# kubectl
RUN curl -fsSLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && echo "$(curl -fsSL https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256)  kubectl" | sha256sum -c - \
    && install -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl \
    && kubectl version --client

# Helm
RUN curl -fsSLO "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" \
    && echo "$(curl -fsSL https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz.sha256sum | awk '{print $1}')  helm-${HELM_VERSION}-linux-amd64.tar.gz" | sha256sum -c - \
    && tar -xzf "helm-${HELM_VERSION}-linux-amd64.tar.gz" \
    && install -m 0755 linux-amd64/helm /usr/local/bin/helm \
    && rm -rf linux-amd64 "helm-${HELM_VERSION}-linux-amd64.tar.gz" \
    && helm version

# Terraform
RUN curl -fsSLO "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip" \
    && curl -fsSLO "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_SHA256SUMS" \
    && grep " terraform_${TF_VERSION}_linux_amd64.zip\$" "terraform_${TF_VERSION}_SHA256SUMS" | sha256sum -c - \
    && unzip -o "terraform_${TF_VERSION}_linux_amd64.zip" terraform \
    && install -m 0755 terraform /usr/local/bin/terraform \
    && rm -f terraform "terraform_${TF_VERSION}_linux_amd64.zip" "terraform_${TF_VERSION}_SHA256SUMS" \
    && terraform version

# yq
RUN curl -fsSL -o yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" \
    && install -m 0755 yq /usr/local/bin/yq \
    && rm yq \
    && yq --version

# jq
RUN curl -fsSLO "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-amd64" \
    && curl -fsSLO "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/sha256sum.txt" \
    && grep " jq-linux-amd64\$" sha256sum.txt | sha256sum -c - \
    && install -m 0755 jq-linux-amd64 /usr/local/bin/jq \
    && rm -f jq-linux-amd64 sha256sum.txt \
    && jq --version

# Rancher CLI
RUN curl -fsSLO "https://github.com/rancher/cli/releases/download/${RANCHER_VERSION}/rancher-linux-amd64-${RANCHER_VERSION}.tar.gz" \
    && curl -fsSLO "https://github.com/rancher/cli/releases/download/${RANCHER_VERSION}/sha256sum.txt" \
    && grep "rancher-linux-amd64-${RANCHER_VERSION}.tar.gz\$" sha256sum.txt | sed 's#  \./#  #' | sha256sum -c - \
    && tar -xzf "rancher-linux-amd64-${RANCHER_VERSION}.tar.gz" \
    && install -m 0755 "rancher-${RANCHER_VERSION}/rancher" /usr/local/bin/rancher \
    && rm -rf "rancher-${RANCHER_VERSION}" "rancher-linux-amd64-${RANCHER_VERSION}.tar.gz" sha256sum.txt \
    && rancher --version

# kubeconform (maintained replacement for archived kubeval)
RUN curl -fsSLO "https://github.com/yannh/kubeconform/releases/download/${KUBECONFORM_VERSION}/kubeconform-linux-amd64.tar.gz" \
    && curl -fsSLO "https://github.com/yannh/kubeconform/releases/download/${KUBECONFORM_VERSION}/CHECKSUMS" \
    && grep " kubeconform-linux-amd64.tar.gz\$" CHECKSUMS | sha256sum -c - \
    && tar -xzf kubeconform-linux-amd64.tar.gz kubeconform \
    && install -m 0755 kubeconform /usr/local/bin/kubeconform \
    && rm -f kubeconform kubeconform-linux-amd64.tar.gz CHECKSUMS \
    && kubeconform -v

# Flux CLI (install script verifies checksums)
RUN curl -fsSL -o install_flux.sh https://fluxcd.io/install.sh \
    && FLUX_VERSION="${FLUX_VERSION}" bash install_flux.sh \
    && rm install_flux.sh \
    && flux --version

# Argo Workflows CLI
RUN curl -fsSLO "https://github.com/argoproj/argo-workflows/releases/download/${ARGO_VERSION}/argo-linux-amd64.gz" \
    && curl -fsSLO "https://github.com/argoproj/argo-workflows/releases/download/${ARGO_VERSION}/argo-workflows-cli-checksums.txt" \
    && grep " argo-linux-amd64.gz\$" argo-workflows-cli-checksums.txt | sed 's#  \./#  #' | sha256sum -c - \
    && gzip -d -f argo-linux-amd64.gz \
    && install -m 0755 argo-linux-amd64 /usr/local/bin/argo \
    && rm -f argo-linux-amd64 argo-workflows-cli-checksums.txt \
    && argo version --short

# kpt
RUN curl -fsSLO "https://github.com/kptdev/kpt/releases/download/v${KPT_VERSION}/kpt_linux_amd64" \
    && curl -fsSLO "https://github.com/kptdev/kpt/releases/download/v${KPT_VERSION}/checksums.txt" \
    && grep " kpt_linux_amd64\$" checksums.txt | sha256sum -c - \
    && install -m 0755 kpt_linux_amd64 /usr/local/bin/kpt \
    && rm -f kpt_linux_amd64 checksums.txt \
    && kpt version

# subctl
RUN curl -fsSL -o get-submariner.sh https://get.submariner.io \
    && VERSION="${SUBCTL_VERSION}" DESTDIR=/usr/local/bin bash get-submariner.sh \
    && rm get-submariner.sh \
    && subctl version

# mongosh
RUN curl -fsSLO "https://downloads.mongodb.com/compass/mongosh-${MONGOSH_VERSION}-linux-x64.tgz" \
    && tar -xzf "mongosh-${MONGOSH_VERSION}-linux-x64.tgz" \
    && install -m 0755 "mongosh-${MONGOSH_VERSION}-linux-x64/bin/mongosh" /usr/local/bin/mongosh \
    && install -m 0755 "mongosh-${MONGOSH_VERSION}-linux-x64/bin/mongosh_crypt_v1.so" /usr/local/lib/ \
    && rm -rf "mongosh-${MONGOSH_VERSION}-linux-x64" "mongosh-${MONGOSH_VERSION}-linux-x64.tgz" \
    && mongosh --version

# Crossplane CLI
RUN curl -fsSL -o get_crossplane.sh https://raw.githubusercontent.com/crossplane/crossplane/main/install.sh \
    && XP_VERSION="${CROSSPLANE_VERSION}" bash get_crossplane.sh \
    && install -m 0755 crossplane /usr/local/bin/crossplane \
    && rm -f crossplane get_crossplane.sh \
    && crossplane version --client

ARG USER=coder
RUN useradd --groups sudo --no-create-home --shell /bin/bash ${USER} \
    && echo "${USER} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${USER} \
    && chmod 0440 /etc/sudoers.d/${USER} \
    && rm -rf /tmp/install

USER ${USER}
WORKDIR /home/${USER}
