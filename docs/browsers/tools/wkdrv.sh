#!/bin/bash
pkill -f MiniBrowser; pkill -f WebKitWebProcess; pkill -f WebKitWebDriver; sleep 1
JSC_useSharedArrayBuffer=${SAB:-true} DISPLAY=:99 nohup WebKitWebDriver --port=4444 --host=127.0.0.1 > /opt/kw/browsers-work/wkdriver.log 2>&1 &
sleep 1
