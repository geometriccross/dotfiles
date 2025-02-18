#!/bin/bash

# move fastq file into passed path
dir_name="${1}"
: "${dir_name:=.}"

find "${dir_name}" -maxdepth 2 -name "*.fastq.gz" | while read -r file; do
	mv "${file}" "${dir_name}"
done

find "${dir_name}" -mindepth 1 -type d | while read -r empty_dir; do
	rm -d "${empty_dir}"
done
