# AWS Secrets Injector

This project provides a lightweight, secure init container designed to fetch secrets from AWS Secrets Manager and make them available to other containers in a Kubernetes Pod.

The injector is written in Go and built into a minimal, non-root, distroless Docker image for enhanced security. It leverages IAM Roles for Service Accounts (IRSA) in Kubernetes to securely authenticate with AWS without needing static credentials.

## Configuration

The init container is configured using three environment variables:

| Variable       | Description                                                                 | Example                               |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| `SECRET_NAME`  | The name or ARN of the secret to fetch from AWS Secrets Manager.            | `my-app/secrets/production`           |
| `AWS_REGION`   | The AWS region where the secret is stored.                                  | `us-east-1`                           |
| `OUTPUT_PATH`  | The full path within the container where the secret content will be written. | `/secrets/db-password.txt`            |

## Building the Container

To build the Docker image from the source code, navigate to the project's root directory and run the following command:

```bash
docker build -t application/aws-secrets-injector:latest -f build/Dockerfile .
```
