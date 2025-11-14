## About
This is a private helm chart

### packaging
``` shell
helm package identity-server
helm registry login registry-1.docker.io -u hayone
helm push identity-server-0.0.3.tgz oci://registry-1.docker.io/hayone
```