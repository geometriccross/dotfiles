#!/bin/bash

dest=${1:=~}
shift

ls -aF . \
	| grep -v ".gitignore" \
	| grep -v "install.sh" \
	| grep -v / \
	| xargs -I FILE ln -s FILE ${dest}/FILE 
