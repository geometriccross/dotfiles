FROM nvcr.io/nvidia/cuda:12.0.1-devel-ubuntu22.04

RUN apt-get update \
        && apt install -y \
            wget \
            unzip \
            hashcat \
        && rm -rf /var/lib/apt/lists/*

# pdf2john.pl
RUN wget https://github.com/magnumripper/JohnTheRipper/archive/bleeding-jumbo.zip \
        && unzip bleeding-jumbo.zip \
        && ln -s john-bleeding-jumbo/run/pdf2john.pl /pdf2john.pl
