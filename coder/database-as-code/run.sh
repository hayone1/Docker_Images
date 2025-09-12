docker run --init \
  --name bytebase \
  --publish 8080:8080 \
  --health-cmd "curl --fail http://localhost:8080/healthz || exit 1" \
  --health-interval 5m \
  --health-timeout 10s \
  --volume ~/.bytebase/data:/var/opt/bytebase \
  bytebase/bytebase:2.13.1 \
  --data /var/opt/bytebase \
  --port 8080
#   --restart always \