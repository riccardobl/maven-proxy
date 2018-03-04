# Maven-Proxy

Small proxy for maven, useful to group and cache repository into a single url.

## Features

- Basic Auth
- Cache
- Repo grouping
- *-SNAPSHOT 

## Usage
```
docker run -v /srv/maven/data:/data -v /srv/maven/config:/config --name maven-proxy -p 8888:8080 -d riccardoblb/maven-proxy:amd64
```

With custom config
```
docker run -eAUTH_DATA="`cat custom_auth.json`" -eCONFIG_DATA="`cat custom_config.json`" -v /srv/maven/data:/data -v /srv/maven/config:/config --name maven-proxy -p 8888:8080 -d riccardoblb/maven-proxy:amd64
```


Set `-eNO_AUTH="1"` to disable the basic auth

```
docker run -eAUTH_DATA="" -eCONFIG_DATA="`cat custom_config.json`" -v /srv/maven/data:/data -v /srv/maven/config:/config --name maven-proxy -p 8888:8080 -d riccardoblb/maven-proxy:amd64
```