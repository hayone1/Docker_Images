docker build -t frappe-bench .

docker tag frappe-bench hayone/frappe-bench:v0.57.0
docker tag frappe-bench hayone/frappe-bench:latest
docker push hayone/frappe-bench:v0.57.0
docker push hayone/frappe-bench:latest

