FROM nvcr.io/nvidia/cuda:12.0.1-devel-ubuntu22.04

RUN apt-get update \
        && apt-get install -y \
            wget \
            p7zip-full \
            hashcat \
        && rm -rf /var/lib/apt/lists/*

RUN wget https://github.com/hashcat/hashcat-utils/releases/download/v1.9/hashcat-utils-1.9.7z \
        && 7z x hashcat-utils-1.9.7z \
        && rm hashcat-utils-1.9.7z \
        && mv hashcat-utils-1.9 /usr/local/bin/pdf2hashcat \
        && chmod +x /usr/local/bin/pdf2hashcat

