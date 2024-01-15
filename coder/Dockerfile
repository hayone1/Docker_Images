FROM ghcr.io/coder/podman:ubuntu
USER root

# Use a base image
FROM ubuntu:20.04

RUN apt-get update \
	&& apt-get install -y \
	curl wget \
	git \
	sudo \
	vim \
	python3-pip \
	tar gzip unzip \
	&& rm -rf /var/lib/apt/lists/*

# Install Helm
RUN echo -e "Installing helm..." && \
    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 && \
    chmod +x get_helm.sh && \
    ./get_helm.sh && \
    rm get_helm.sh && \
    helm version

# Install kubectl
RUN echo -e "Installing kubectl..." && \
    curl -LO --silent "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mkdir -p ~/.local/bin && \
    mv kubectl /usr/local/bin/ && \
    kubectl version --client

# Install figlet, unzip, netcat, tree, terraform
RUN echo -e "Installing figlet..." && \
    curl -LO --silent http://ftp.debian.org/debian/pool/main/f/figlet/figlet_2.2.5-3+b1_amd64.deb && \
    sudo apt-get install -y ./figlet_2.2.5-3+b1_amd64.deb && \
    rm figlet_2.2.5-3+b1_amd64.deb

RUN echo -e "Installing netcat..." && \
    curl -LO --silent http://ftp.debian.org/debian/pool/main/n/netcat-openbsd/netcat-openbsd_1.195-2_amd64.deb && \
    sudo apt-get install -y ./netcat-openbsd_1.195-2_amd64.deb && \
    rm netcat-openbsd_1.195-2_amd64.deb

RUN echo -e "Installing tree..." && \
    curl -LO --silent http://ftp.debian.org/debian/pool/main/t/tree/tree_1.8.0-1_amd64.deb && \
    sudo apt-get install -y ./tree_1.8.0-1_amd64.deb && \
    rm tree_1.8.0-1_amd64.deb

RUN echo -e "Installing terraform..." && \
    TF_VERSION='1.6.2' && \
    curl -LO --silent "https://releases.hashicorp.com/terraform/1.6.2/terraform_{$TF_VERSION}_linux_amd64.zip" && \
    unzip terraform_${TF_VERSION}_linux_amd64.zip && \
    chmod +x terraform && \
    mv terraform /usr/local/bin/ && \
    terraform --help && \
    rm terraform_${TF_VERSION}_linux_amd64.zip

# Install yq
RUN echo -e "Installing yq..." && \
    curl -LO https://github.com/mikefarah/yq/releases/download/v4.34.2/yq_linux_amd64 && \
    mv yq_linux_amd64 yq && \
    chmod +x yq && \
    mv yq /usr/local/bin/ && \
    yq --version

# Install jq
RUN echo -e "Installing jq..." && \
    curl -LO --silent https://github.com/jqlang/jq/releases/download/jq-1.6/jq-linux64 && \
    mv jq-linux64 jq && \
    chmod +x jq && \
    mv jq /usr/local/bin/ && \
    jq --version

# Install Rancher CLI
RUN rancher_version="v2.4.11" && \
    echo -e "Installing Rancher CLI..." && \
    curl -LO --silent "https://github.com/rancher/cli/releases/download/${rancher_version}/rancher-linux-amd64-${rancher_version}.tar.gz" && \
    tar -xzf "rancher-linux-amd64-${rancher_version}.tar.gz" && \
    chmod +x "rancher-${rancher_version}/rancher" && \
    mv "rancher-${rancher_version}/rancher" /usr/local/bin/ && \
    rancher --version && \
    rm "rancher-linux-amd64-${rancher_version}.tar.gz" && \
    rm -rf "rancher-${rancher_version}"

# Install kubeval
RUN echo -e "Installing kubeval..." && \
    curl -LO --silent "https://github.com/instrumenta/kubeval/releases/latest/download/kubeval-linux-amd64.tar.gz" && \
    tar -xzf kubeval-linux-amd64.tar.gz && \
    chmod +x kubeval && \
    mv kubeval /usr/local/bin/ && \
    kubeval --version && \
    rm kubeval-linux-amd64.tar.gz

# Install flux CLI
RUN export FLUX_VERSION="2.0.0" && \
    curl -s https://fluxcd.io/install.sh > install_flux.sh && \
    chmod +x install_flux.sh && \
    ./install_flux.sh

# Install Argo CLI
RUN echo -e "Installing Argo CLI..." && \
    ARGO_VERSION='v3.5.1' && \
    curl -LO --silent https://github.com/argoproj/argo-workflows/releases/download/${ARGO_VERSION}/argo-linux-amd64.gz && \
    gzip -d -f argo-linux-amd64.gz && \
    mv argo-linux-amd64 argo && \
    chmod +x argo && \
    mv argo /usr/local/bin/ && \
    argo version --short

# Install kpt
RUN echo -e "Installing kpt..." && \
    KPT_VERSION='1.0.0-beta.44' && \
    curl -LO --silent "https://github.com/kptdev/kpt/releases/download/v${KPT_VERSION}/kpt_linux_amd64-${KPT_VERSION}.tar.gz" && \
	tar -xzf kpt_linux_amd64-${KPT_VERSION}.tar.gz && \
	chmod +x kpt && \
	mv kpt /usr/local/bin/ && \
	kpt version


ARG USER=coder
RUN useradd --groups sudo --no-create-home --shell /bin/bash ${USER} \
	&& echo "${USER} ALL=(ALL) NOPASSWD:ALL" >/etc/sudoers.d/${USER} \
	&& chmod 0440 /etc/sudoers.d/${USER}
RUN apt-get autoremove -y && \
	rm -rf /var/lib/apt/lists/*
USER ${USER}
WORKDIR /home/${USER}