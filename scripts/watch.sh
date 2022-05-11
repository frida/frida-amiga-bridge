#!/usr/bin/env bash
# Author: hot3eed <hot3eed@gmail.com>
# License: Apache-2.0

tsc -w &
P1=$!
frida-compile -o _agent.js scripts/loader.js -w #&
P2=$!
wait $P1 $P2
