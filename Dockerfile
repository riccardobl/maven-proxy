FROM riccardoblb/nodejs:amd64
LABEL maintainer="Riccardo Balbo <riccardo0blb@gmail.com>"

ENV CONFIG_TEMPLATE="/proxy.json" \
CONFIG_FILE="/config/proxy.json" \
CONFIG_DATA="" \
SNAPSHOT_DURATION="86400" \
AUTH_FILE="/config/auth.json" \
AUTH_TEMPLATE="/auth.json" \
AUTH_DATA="" \
NO_AUTH=""

ADD src/init.sh /init.sh
ADD src/proxy.js /proxy.js
ADD templates/proxy.json /proxy.json
ADD templates/auth.json /auth.json

USER root
RUN mkdir -p /config && mkdir -p /data && chmod +x /init.sh &&  npm install request basic-auth

CMD [""]
ENTRYPOINT [ "/init.sh" ]

