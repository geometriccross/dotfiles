#!/bin/bash

dest=${1:-..}
shift

# cerate link file in current dir int dest path
ls -ap ${dest} \
	| grep -v ".gitignore" \
	| grep -v "install.sh" \
	| grep -v /
