# Use the bitnami/python base image
FROM bitnami/python

# Install kubectl
RUN apt-get update
RUN apt-get install -y apt-transport-https ca-certificates curl
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
RUN chmod +x ./kubectl
RUN mv ./kubectl /usr/local/bin

# install relevant python packages
RUN pip install kubernetes
RUN pip install PyYAML
RUN pip install argo-workflows
RUN pip install hera
RUN pip install multiprocess

# RUN curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
# RUN echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | tee /etc/apt/sources.list.d/kubernetes.list
# RUN apt-get update
# RUN apt-get install -y kubectl


# Set the entry point back to python
ENTRYPOINT ["python"]