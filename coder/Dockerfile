FROM ghcr.io/coder/podman:ubuntu
USER root

RUN gpg -k

RUN gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

RUN echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list

RUN apt-get update \
	&& apt-get install -y \
	curl wget \
	git \
	sudo \
	vim \
	python3-pip k6\
	tar gzip unzip \
	&& apt-get autoremove -y \
	&& rm -rf /var/lib/apt/lists/*

# Install pipenv
RUN pip install pipenv

#install node & npm
ENV NODE_VERSION=16.13.0
RUN apt install -y curl
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
RUN node --version
RUN npm --version

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
    curl -LO https://github.com/argoproj/argo-workflows/releases/download/${ARGO_VERSION}/argo-linux-amd64.gz && \
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
	kpt version && \
    rm kpt_linux_amd64-${KPT_VERSION}.tar.gz

# install subctl
RUN echo -e "Installing subctl..." && \
    curl -Ls https://get.submariner.io > get-submariner.sh && \
    chmod +x get-submariner.sh && \
    ./get-submariner.sh && \
    rm get-submariner.sh

# Install mongosh
RUN echo -e "Installing mongosh..." && \
    MongoSH_VERSION='2.1.3' && \
    curl -LO --silent "https://downloads.mongodb.com/compass/mongosh-${MongoSH_VERSION}-linux-x64.tgz" && \
	tar -xzf mongosh-${MongoSH_VERSION}-linux-x64.tgz && \
	chmod +x mongosh-${MongoSH_VERSION}-linux-x64/bin/mongosh && \
	mv mongosh-${MongoSH_VERSION}-linux-x64/bin/mongosh /usr/local/bin/ && \
	mv mongosh-${MongoSH_VERSION}-linux-x64/bin/mongosh_crypt_v1.so /usr/local/bin/ && \
	mongosh --version && \
    rm -r mongosh-${MongoSH_VERSION}-linux-x64

# Install bytebase
RUN echo -e "Installing bytebase..." && \
    curl -fsSL -o get_bytebase.sh https://raw.githubusercontent.com/bytebase/install/HEAD/install.sh && \
    chmod +x get_bytebase.sh && \
    ./get_bytebase.sh && \
    bb --help && \
    rm get_bytebase.sh

# Install crossplane
RUN echo -e "Installing crossplane..." && \
    curl -fsSL -o get_crossplane.sh https://raw.githubusercontent.com/crossplane/crossplane/master/install.sh && \
    chmod +x get_crossplane.sh && \
    ./get_crossplane.sh && \
    mv crossplane /usr/local/bin && \
    crossplane --version && \
    rm get_crossplane.sh
    
# Install crossplane
RUN echo -e "Installing crossplane..." && \
    curl -fsSL -o get_crossplane.sh https://raw.githubusercontent.com/crossplane/crossplane/master/install.sh && \
    chmod +x get_crossplane.sh && \
    ./get_crossplane.sh && \
    mv crossplane /usr/local/bin && \
    crossplane --version && \
    rm get_crossplane.sh

ARG USER=coder
RUN useradd --groups sudo --no-create-home --shell /bin/bash ${USER} \
	&& echo "${USER} ALL=(ALL) NOPASSWD:ALL" >/etc/sudoers.d/${USER} \
	&& chmod 0440 /etc/sudoers.d/${USER}
# RUN apt-get autoremove -y && \
# 	rm -rf /var/lib/apt/lists/*
USER ${USER}
WORKDIR /home/${USER}