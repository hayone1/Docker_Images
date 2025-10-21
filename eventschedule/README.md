docker build -t moser .

docker tag moser hayone/moser:v0.57.0
docker tag moser hayone/moser:latest
docker push hayone/moser:v0.57.0
docker push hayone/moser:latest

