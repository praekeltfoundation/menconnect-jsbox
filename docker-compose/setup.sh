#!/bin/bash
set -e

# Create the Junebug channels
curl -X POST -H 'Content-Type: application/json' -d '{
    "amqp_queue": "jsbox_ussd_registration",
    "type": "telnet_addr",
    "config": {
        "twisted_endpoint": "tcp:9001"
    }
    }' localhost/jb/channels/