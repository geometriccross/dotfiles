#!/bin/bash

docker images --format '{{.Repository}}' |
	grep pdfhash-module >/dev/null ||
	docker image build . -f ./modules/pdfhash/Dockerfile -t pdfhash-module:latest -q >/dev/null

process_file() {
	local file="$1"
	docker run --rm -v "$file:/$(basename "$file"):ro" pdfhash-module:latest /pdf2john.pl "/$(basename "$file")"
}

if [ $# -gt 0 ]; then
	for file in "$@"; do
		process_file "$file"
	done
else
	while read -r file; do
		process_file "$file"
	done
fi
