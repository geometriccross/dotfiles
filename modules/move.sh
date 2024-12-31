find "${1:-.}" -maxdepth 1 -name "*.fastq.gz" | while read -r file; do
	dir_name=$(echo "${file}" | sed 's/_L001_R._001.fastq.gz//g' | xargs -0 basename -a)
	mkdir -p "${dir_name}"
	mv "${file}" "${dir_name}"
done
