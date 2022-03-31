FROM praekeltfoundation/vxsandbox:node_12.x
MAINTAINER Praekelt Foundation <dev@praekeltfoundation.org>

# Install nodejs dependencies
COPY package.json /app/package.json
COPY config/go-app-ussd-registration.eng_ZA.json /app/
COPY config/go-app-ussd-registration.sot_ZA.json /app/
COPY config/go-app-ussd-registration.zul_ZA.json /app/
WORKDIR /app
RUN npm install --production

# Workaround for sandboxed application losing context - manually install the
# *dependencies* globally.
# See https://github.com/praekelt/vumi-sandbox/issues/15
RUN mv ./node_modules /usr/local/site-packages/vxsandbox/


# Copy in the app Javascript
COPY go-*.js /app/
COPY config /app/config

RUN pip install raven==3.5.2 vumi-unidecode-middleware==0.0.2
