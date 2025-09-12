docker build -t ts-node-cli .

docker tag ts-node-cli hayone/ts-node-cli:0.0.1
docker tag ts-node-cli hayone/ts-node-cli:latest
docker push hayone/ts-node-cli:0.0.1
docker push hayone/ts-node-cli:latest
