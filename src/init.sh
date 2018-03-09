#!/bin/sh

if [ ! -f "$CONFIG_FILE" ];
then
    cp "$CONFIG_TEMPLATE"  "$CONFIG_FILE" 
fi

if [ "$CONFIG_DATA" != "" ];
then
    echo "$CONFIG_DATA" > "$CONFIG_FILE"
fi

if [ "$SNAPSHOT_DURATION" != "0" -a "$SNAPSHOT_DURATION" != "" ];
then
    while true ;
    do
        find /data  -type d -name "*-SNAPSHOT"  -exec rm -R "{}" +
        sleep $SNAPSHOT_DURATION
    done &
fi
find /data  -type d -name "*.dl"  -exec rm  "{}" +
find /data  -type d -name "*.lock"  -exec rm "{}" +

node /proxy.js "$CONFIG_FILE"  $@ 
