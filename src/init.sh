#!/bin/sh

if [ ! -f "$CONFIG_FILE" ];
then
    cp "$CONFIG_TEMPLATE"  "$CONFIG_FILE" 
fi

if [ "$CONFIG_DATA" != "" ];
then
    echo "$CONFIG_DATA" > "$CONFIG_FILE"
fi


if [ ! -f "$AUTH_FILE" ];
then
    cp "$AUTH_TEMPLATE"  "$AUTH_FILE" 
fi

if [ "$AUTH_DATA" != "" ];
then
    echo "$AUTH_DATA" > "$AUTH_FILE"
fi

if [ "$NO_AUTH" != "" ];
then
    AUTH_FILE="null"
fi


if [ "$SNAPSHOT_DURATION" != "0" -a "$SNAPSHOT_DURATION" != "" ];
then
    while true ;
    do
        find /data  -type d -name "*-SNAPSHOT"  -exec rm -R "{}" +
        sleep $SNAPSHOT_DURATION
    done &
fi

node /proxy.js "$CONFIG_FILE" "$AUTH_FILE" $@ 
