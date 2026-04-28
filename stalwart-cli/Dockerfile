# --- Stage 1: Build/Download ---
FROM debian:bookworm-slim AS builder
LABEL org.opencontainers.image.title="Stalwart CLI" \
      org.opencontainers.image.description="Command-line interface for Stalwart server management" \
      org.opencontainers.image.url="https://stalwartlabs.com" \
      org.opencontainers.image.source="https://github.com/stalwartlabs/cli" \
      maintainer="boluwatife.morawo@gmail.com"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install the Stalwart CLI
RUN curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/stalwartlabs/cli/releases/latest/download/stalwart-cli-installer.sh | sh

# --- Final Runtime ---
FROM debian:bookworm-slim

# Define IDs as variables for consistency
ARG USER_ID=2000
ARG GROUP_ID=2000

# Install dependencies for Azure CLI and the CLI itself
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && curl -sL https://aka.ms/InstallAzureCLIDeb | bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create group and user with specific numeric IDs
RUN groupadd -g ${GROUP_ID} stalwart && \
    useradd -l -u ${USER_ID} -g stalwart -m -s /bin/bash stalwart

# Copy the binary and ensure ownership
COPY --from=builder /root/.cargo/bin/stalwart-cli /usr/local/bin/stalwart-cli
RUN chmod +x /usr/local/bin/stalwart-cli

# Ownership of the home directory for Azure CLI config files
RUN chown -R ${USER_ID}:${GROUP_ID} /home/stalwart

USER ${USER_ID}
WORKDIR /home/stalwart

# Since you now have two CLIs, you might want to use a shell 
# or keep stalwart-cli as the entrypoint
ENTRYPOINT ["stalwart-cli"]