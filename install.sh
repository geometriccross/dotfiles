#!/bin/bash

filtering_path() {
	echo ${1:-$(cat -)} \
		| grep -v ".gitignore" \
		| grep -v "install.sh" \
		| grep -v /
}

create_link() {
	dest=${1:?Destination has not passed}
	shift

	echo ${1:-$(cat -)} \
		| xargs -I FILE ln -s FILE ${dest}/FILE 
}
