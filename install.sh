#!/bin/bash

ls -aF $(cd $(dirname ${BASH_SOURCE:-$0}); pwd) \
	| grep -v ".gitignore" \
	| grep -v "install.sh" \
	| grep -v / \
	| xargs -I FILE ln -s FILE ${1:-${HOME}}/FILE 
