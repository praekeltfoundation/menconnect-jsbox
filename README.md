# menconnect-jsbox

## Trying out the applications

There is a docker compose setup that should allow someone to easily get most of the
components up and running to be able to easily try out the USSD lines.

Requirements:
 - docker
 - docker-compose
 - curl
 - telnet
 - Radidpro Instance
 - Turn instance

Firstly, change to the docker-compose folder:
```
cd docker-compose
```

Then update the json config files with your Rapidpro and Turn details:
```
vi ussd_registration.json
```

Then run the `up` command:
```
docker-compose up
```

Then, once all the services are up and running, run the setup script for the
initial setup of all the services:
```
./setup.sh
```

Then, you can use telnet to access the USSD lines:
 - Registration USSD: `telnet localhost 9001`

Example:
```
~ telnet localhost 9001

Escape character is '^]'.
Please provide "to_addr":
*120*1234#
Please provide "from_addr":
+27821234567
[Sending all messages to: *120*1234# and from: +27821234567]
MenConnect needs to process your personal info to send you relevant messages. Do you agree?
1. Yes
2. No
```