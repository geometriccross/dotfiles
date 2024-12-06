#!/bin/bash

filtering_path() {
	echo ${1:-$(cat -)} \
		| grep -v ".gitignore" \
		| grep -v "install.sh" \
		| grep -v /
}
