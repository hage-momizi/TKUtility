#!/bin/bash
cd /root/bot-git || exit 1
git pull
systemctl restart tk
