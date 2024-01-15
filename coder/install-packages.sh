#!/bin/bash

# RED='\033[0;31m'
# YELLOW='\033[0;33m'
# GREEN='\033[0;32m'
# BLUE='\033[0;34m'
# RESET='\033[0m'  # Reset to default text attributes

# log_folder="log"
# mkdir -p "$log_folder"
# log_file="$log_folder/D-stack_ultraflux_pre-requisites$(date +'%Y%m%d_%H%M%S').log"
# # Redirect stdout and stderr to both console and log file
# exec > >(tee -a "$log_file") 2>&1

# - Install helm
(
echo -e "${YELLOW}Installing helm...${RESET}"
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
sudo chmod +x get_helm.sh
./get_helm.sh
rm get_helm.sh
helm version
) &

# - Install kubectl
(
echo -e "${YELLOW}Installing kubectl...${RESET}"
curl -LO --silent "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
# uncomment to validate the binary
# curl -LO --silent "https://dl.k8s.io/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl.sha256"
# echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
sudo chmod +x kubectl
mkdir -p ~/.local/bin
sudo mv kubectl /usr/local/bin/
kubectl version --client
) &

# Install figlet
(
echo -e "${YELLOW}Installing figlet...${RESET}"
curl -LO --silent http://ftp.debian.org/debian/pool/main/f/figlet/figlet_2.2.5-3+b1_amd64.deb
sudo apt-get install ./figlet_2.2.5-3+b1_amd64.deb
figlet Figlet Installed!
rm figlet_2.2.5-3+b1_amd64.deb

# Install unzip
echo -e "${YELLOW}Installing unzip...${RESET}"
curl -LO --silent http://ftp.debian.org/debian/pool/main/u/unzip/unzip_6.0-23+deb10u2_amd64.deb
sudo apt-get install ./unzip_6.0-23+deb10u2_amd64.deb
unzip --help
rm unzip_6.0-23+deb10u2_amd64.deb


# Install netcat
echo -e "${YELLOW}Installing netcat...${RESET}"
curl -LO --silent http://ftp.debian.org/debian/pool/main/n/netcat-openbsd/netcat-openbsd_1.195-2_amd64.deb
sudo apt-get install ./netcat-openbsd_1.195-2_amd64.deb
nc -h
rm netcat-openbsd_1.195-2_amd64.deb

# Install tree
echo -e "${YELLOW}Installing tree...${RESET}"
curl -LO --silent http://ftp.debian.org/debian/pool/main/t/tree/tree_1.8.0-1_amd64.deb
sudo apt-get install ./tree_1.8.0-1_amd64.deb
tree --version
rm tree_1.8.0-1_amd64.deb

# Install terraform
echo -e "${YELLOW}Installing Terraform...${RESET}"
TF_VERSION='1.6.2'
curl -LO --silent "https://releases.hashicorp.com/terraform/1.6.2/terraform_{$TF_VERSION}_linux_amd64.zip"
unzip terraform_${TF_VERSION}_linux_amd64.zip
sudo chmod +x terraform
sudo mv terraform /usr/local/bin/
terraform --help
rm terraform_${TF_VERSION}_linux_amd64.zip
) &

# Install yq 
# if ! command -v yq &> /dev/null; then
(
echo -e "${YELLOW}Installing yq...${RESET}"
# curl -LO https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
curl -LO https://github.com/mikefarah/yq/releases/download/v4.34.2/yq_linux_amd64
mv yq_linux_amd64 yq
sudo chmod +x yq
sudo mv yq /usr/local/bin/
yq --version
) &

# Install jq
(
echo -e "${YELLOW}Installing jq...${RESET}"
# curl -LO --silent https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
curl -LO --silent https://github.com/jqlang/jq/releases/download/jq-1.6/jq-linux64
mv jq-linux64 jq
sudo chmod +x jq
sudo mv jq /usr/local/bin/
jq --version
) &



# Install Rancher CLi
(
rancher_version="v2.4.11"
echo -e "${YELLOW}Installing Rancher CLI...${RESET}"
curl -LO --silent "https://github.com/rancher/cli/releases/download/${rancher_version}/rancher-linux-amd64-${rancher_version}.tar.gz"
tar -xzf "rancher-linux-amd64-${rancher_version}.tar.gz"
sudo chmod +x "rancher-${rancher_version}/rancher"
sudo mv "rancher-${rancher_version}/rancher" /usr/local/bin/
rancher --version
rm "rancher-linux-amd64-${rancher_version}.tar.gz"
rm -rf "rancher-${rancher_version}"
) &

# # Install gitops
# (
# echo -e "${YELLOW}Installing GitOps...${RESET}"
# curl -LO --silent "https://github.com/weaveworks/weave-gitops/releases/download/v0.38.0/gitops-$(uname)-$(uname -m).tar.gz"
# tar -xzf "gitops-$(uname)-$(uname -m).tar.gz"
# sudo chmod +x gitops
# sudo mv gitops /usr/local/bin/
# gitops version
# ) &

# Install kubeval
(
echo -e "${YELLOW}Installing kubeval...${RESET}"
curl -LO --silent "https://github.com/instrumenta/kubeval/releases/latest/download/kubeval-linux-amd64.tar.gz"
tar -xzf kubeval-linux-amd64.tar.gz
sudo chmod +x kubeval
sudo mv kubeval /usr/local/bin/
kubeval --version
rm kubeval-linux-amd64.tar.gz
) &

# install flux CLI
(
export FLUX_VERSION="2.0.0"
curl -s https://fluxcd.io/install.sh > install_flux.sh
sudo chmod +x install_flux.sh
./install_flux.sh
# . <(flux completion bash)
) &

(
# install Argo CLI
echo -e "${YELLOW}Installing Argo CLI...${RESET}"
ARGO_VERSION='v3.5.1'
curl -LO --silent https://github.com/argoproj/argo-workflows/releases/download/v3.5.1/argo-linux-amd64.gz
gzip -d -f argo-linux-amd64.gz
mv argo-linux-amd64 argo
sudo chmod +x argo
sudo mv argo /usr/local/bin/
argo version --short
) &


# install docker-cli
# echo -e "${YELLOW}Installing docker cli...${RESET}"
# DOCKER_VERSION='23.0.6-1'
# curl -LO --silent https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce-cli_${DOCKER_VERSION}~ubuntu.18.04~bionic_amd64.deb
# sudo apt-get install ./docker-ce-cli_${DOCKER_VERSION}~ubuntu.18.04~bionic_amd64.deb
# sudo groupadd docker
# sudo usermod -aG docker $USER
# newgrp docker
# docker --version
# rm docker-ce-cli_${DOCKER_VERSION}~ubuntu.18.04~bionic_amd64.deb


(
# Install kpt
echo -e "${YELLOW}Installing kpt...${RESET}"
KPT_VERSION='1.0.0-beta.44'
curl -LO --silent "https://github.com/kptdev/kpt/releases/download/v${KPT_VERSION}/kpt_linux_amd64-${KPT_VERSION}.tar.gz"
tar -xzf kpt_linux_amd64-${KPT_VERSION}.tar.gz
sudo chmod +x kpt
sudo mv kpt /usr/local/bin/
kpt version
kpt completion bash > kpt-completeion.sh
sudo chmod +x kpt-completeion.sh
./kpt-completeion.sh
rm kpt_linux_amd64-${KPT_VERSION}.tar.gz
rm kpt-completeion.sh

export KPT_FN_RUNTIME="podman"
) &


# Install pv-migrate
(
echo -e "${YELLOW}Installing PV Migrate...${RESET}"
PV_VERSION='v1.3.0'
curl -LO --silent https://github.com/utkuozdemir/pv-migrate/releases/download/${PV_VERSION}/pv-migrate_${PV_VERSION}_linux_x86_64.tar.gz
tar -xzf pv-migrate_${PV_VERSION}_linux_x86_64.tar.gz
sudo mv pv-migrate /usr/local/bin/
# source <(pv-migrate completion bash)
pv-migrate --help
rm pv-migrate_${PV_VERSION}_linux_x86_64.tar.gz
) &

(
# Install Submariner subctl
echo -e "${YELLOW}Installing Submariner subctl...${RESET}"
curl -Ls https://get.submariner.io >> get-submariner.sh
sudo chmod +x get-submariner.sh
./get-submariner.sh
)
wait

# sudo chmod +x post-install.sh
echo -e "${GREEN}prerequisites installed${RESET}"
# echo -e "${YELLOW}Execute post-install.sh to complete pre-requisite installation${RESET}"