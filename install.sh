#!/bin/bash

base_dir=$(cd $(dirname ${BASH_SOURCE:-$0}); pwd)

ls -aF ${base_dir} \
	| grep -v ".gitignore" \
	| grep -v "install.sh" \
	| grep -v / \
	| xargs -I FILE ln -s ${base_dir}/FILE ${1:-${HOME}}/FILE 
